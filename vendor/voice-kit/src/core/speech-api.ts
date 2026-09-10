/**
 * A camada HTTP do servidor de voz. Só isto — nada de chat, tools ou busca.
 *
 * O servidor é a `speech-api` (Kokoro TTS + Vosk STT), que segue o padrão da OpenAI em
 * `/v1/audio/speech` e `/v1/audio/transcriptions`, mais três rotas próprias: `/health`, `/voices`
 * e `/tts/stream`. Qualquer servidor que responda esse mesmo contrato serve.
 *
 * Nenhuma função aqui toca `window`, `AudioContext` ou DOM: dá para chamar do servidor, de um
 * worker ou do navegador. É por isso que o kit funciona em Next.js sem guarda de ambiente **nesta
 * camada** — as guardas fazem falta no `voice-session.ts`, que abre microfone.
 */

export type VoiceEndpoint = {
  /** Sem barra no fim; a função normaliza de todo jeito. Ex.: `http://<host-do-lab>:8010`. */
  baseUrl: string;
  /** Vazio quando o servidor não pede autenticação, como num acesso por tailnet. */
  apiKey: string;
};

export type ConnectionCheck = { ok: boolean; detail: string };
export type VoiceOption = { id: string; label: string; engine: string; language?: string; ratio?: number };

const voiceUrl = (endpoint: VoiceEndpoint, path: string) => `${endpoint.baseUrl.replace(/\/+$/, "")}/v1/${path}`;
const voiceHeaders = (endpoint: VoiceEndpoint): Record<string, string> =>
  endpoint.apiKey ? { Authorization: `Bearer ${endpoint.apiKey}` } : {};

async function responseDetail(response: Response) {
  const raw = await response.text().catch(() => "");
  try {
    const payload = JSON.parse(raw) as { error?: string | { message?: string }; message?: string };
    return typeof payload.error === "string" ? payload.error : payload.error?.message ?? payload.message ?? raw.slice(0, 240);
  } catch { return raw.slice(0, 240); }
}

/**
 * Lista as vozes com o identificador que o servidor realmente aceita.
 *
 * `/voices/names` só devolve as do motor padrão — as do piper ficam de fora e, sem o prefixo do
 * motor, o servidor recusa com "Unknown voice". `/voices` traz todos os motores e ainda o
 * benchmark, que é o que permite ordenar por velocidade em vez de por ordem alfabética.
 *
 * **Ordene por `ratio`, não por timbre.** O servidor devolve quanto tempo leva para gerar em
 * relação à duração do áudio. Acima de 1 ele perde para o relógio e a fala chega sempre atrasada:
 * medido no lab, piper gera em 0,58× o que fala e kokoro em 2,04×. Escolher voz "bonita" com ratio
 * alto é a forma mais rápida de fazer a conversa parecer travada.
 */
export async function listVoices(endpoint: VoiceEndpoint): Promise<VoiceOption[]> {
  const base = endpoint.baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}/voices`, { headers: { Accept: "application/json", ...voiceHeaders(endpoint) } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json() as {
    default?: string;
    engines?: Record<string, { voices?: Array<{ id?: string; name?: string; label?: string; language?: string; metrics?: { short?: { ratio?: number } } }> }>;
  };

  const options: VoiceOption[] = [];
  for (const [engine, motor] of Object.entries(payload.engines ?? {})) {
    for (const voice of motor.voices ?? []) {
      const id = voice.id ?? (voice.name ? `${engine}:${voice.name}` : null);
      if (!id) continue;
      options.push({ id, label: voice.label || voice.name || id, engine, language: voice.language ?? undefined, ratio: voice.metrics?.short?.ratio });
    }
  }
  if (options.length) {
    // Menor razão primeiro: abaixo de 1 o servidor gera mais rápido do que o áudio dura.
    return options.sort((first, second) => (first.ratio ?? 99) - (second.ratio ?? 99));
  }

  const nomes = await fetch(`${base}/voices/names`, { headers: { Accept: "application/json", ...voiceHeaders(endpoint) } })
    .then((r) => r.json()).catch(() => null) as { base?: string[]; custom?: string[] } | null;
  return [...(nomes?.base ?? []), ...(nomes?.custom ?? [])].map((name) => ({ id: name, label: name, engine: "desconhecido" }));
}

/** Chame antes de habilitar os botões de voz: sem servidor de pé, eles ficam mortos sem dizer por quê. */
export async function checkVoiceEndpoint(endpoint: VoiceEndpoint): Promise<ConnectionCheck> {
  if (!endpoint.baseUrl.trim()) return { ok: false, detail: "Sem endereço configurado." };
  try {
    const response = await fetch(`${endpoint.baseUrl.replace(/\/+$/, "")}/health`, { headers: { Accept: "application/json", ...voiceHeaders(endpoint) } });
    if (!response.ok) return { ok: false, detail: `O servidor respondeu HTTP ${response.status}.` };
    const health = await response.json().catch(() => ({})) as { version?: string };
    return { ok: true, detail: `Conectado${health.version ? ` — versão ${health.version}` : ""}.` };
  } catch {
    return { ok: false, detail: "Não consegui alcançar o servidor. Confira o endereço e a rede." };
  }
}

/**
 * Transcrição em lote. É esta que produz o texto **autoritativo** — o que o app vai obedecer.
 * O rascunho do `SttStream` serve para a tela, não para decidir.
 */
export async function transcribeAudio(endpoint: VoiceEndpoint, audio: Blob, model: string, language = "pt"): Promise<string> {
  const form = new FormData();
  form.append("file", audio, "fala.wav");
  form.append("model", model);
  form.append("language", language);
  const response = await fetch(voiceUrl(endpoint, "audio/transcriptions"), { method: "POST", headers: { Accept: "application/json", ...voiceHeaders(endpoint) }, body: form });
  if (!response.ok) { const detail = await responseDetail(response); throw new Error(`Transcrição falhou (HTTP ${response.status})${detail ? `: ${detail}` : "."}`); }
  const payload = await response.json() as { text?: string; transcript?: string };
  return payload.text ?? payload.transcript ?? "";
}

/**
 * Abre o fluxo de áudio já em geração. Devolve o corpo cru: quem consome decide como tocar,
 * porque tocar PCM em pedaços é problema do lado que tem AudioContext.
 */
export async function streamSpeech(endpoint: VoiceEndpoint, input: string, voice: string): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(`${endpoint.baseUrl.replace(/\/+$/, "")}/tts/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/wav", ...voiceHeaders(endpoint) },
    body: JSON.stringify({ text: input, voice: voice || undefined }),
  });
  if (!response.ok || !response.body) throw new Error(`A síntese em streaming falhou (HTTP ${response.status}).`);
  return response.body;
}

/** Síntese de uma vez, para quando o streaming não vale a pena (frase curta, ou fallback). */
export async function synthesizeSpeech(endpoint: VoiceEndpoint, input: string, model: string, voice: string): Promise<Blob> {
  const response = await fetch(voiceUrl(endpoint, "audio/speech"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/*", ...voiceHeaders(endpoint) },
    body: JSON.stringify({ input, model, voice: voice || undefined }),
  });
  if (!response.ok) { const detail = await responseDetail(response); throw new Error(`Síntese de voz falhou (HTTP ${response.status})${detail ? `: ${detail}` : "."}`); }
  return response.blob();
}
