/**
 * O runtime de voz: microfone entra, texto e áudio saem.
 *
 * Esta é a única peça reescrita na extração. Na Vela ela vivia num documento offscreen do Chrome e
 * conversava por `chrome.runtime.sendMessage`; aqui virou uma classe com callbacks, sem nenhuma API
 * de extensão. A lógica é a mesma, e cada decisão dela foi paga em bug — os comentários dizem qual.
 *
 * ## A divisão de trabalho que faz isso funcionar
 *
 * São dois caminhos de transcrição ao mesmo tempo, e a tentação é escolher um:
 *
 * - **O stream (`/stt/stream`, Vosk) escreve na tela.** Devolve hipótese a cada ~250 ms. É rascunho:
 *   muda enquanto se fala e **nunca abre um turno**.
 * - **O lote (`/v1/audio/transcriptions`, Whisper) decide.** É ele que produz o texto que o app vai
 *   obedecer.
 *
 * O áudio sai duas vezes de propósito. Numa rede local isso custa quase nada, e a alternativa —
 * confiar o comando ao rascunho — troca latência por erro de interpretação. Medido contra o servidor
 * real: para "abrir o site do banco e clicar em extrato", o Vosk entregou "...e querer carinha
 * extrato". Isso viraria uma ação errada.
 *
 * ## Ciclo de vida
 *
 * ```ts
 * const voz = new VoiceSession({ endpoint, models, voice, handlers });
 * await voz.start("live");   // ou "dictation"
 * voz.speak("texto da resposta");
 * voz.stop();
 * ```
 *
 * `start` é idempotente e `stop` pode ser chamado a qualquer momento. Nada aqui roda no servidor:
 * ver a guarda em `start`.
 */

import { UtteranceSegmenter } from "./vad";
import { VoiceMetricsAnalyzer, VoiceVisualMetrics } from "./audio-metrics";
import { encodeWav } from "./wav-encoder";
import { SttStream } from "./stt-stream";
import { CAPTURE_SAMPLE_RATE, CAPTURE_WORKLET_NAME, captureWorkletUrl } from "./worklet";
import { VoiceEndpoint, streamSpeech, synthesizeSpeech, transcribeAudio } from "./speech-api";

export type VoiceSessionState = "idle" | "listening" | "thinking" | "speaking" | "paused" | "error";
export type VoiceMode = "live" | "dictation";

export type VoiceSessionHandlers = {
  /** Mudou o estado. Ligue no visual: é o que troca cor e ritmo. */
  onState?: (state: VoiceSessionState) => void;
  /** ~20x por segundo, com o áudio já suavizado. É o que alimenta o orb. */
  onMetrics?: (metrics: VoiceVisualMetrics, state: VoiceSessionState) => void;
  /** Rascunho do que está sendo falado agora. Some quando o turno fecha. Nunca é comando. */
  onPartial?: (text: string) => void;
  /** Texto autoritativo de um enunciado. É aqui que o seu app abre um turno. */
  onTranscript?: (text: string) => void;
  /** Falhas que o usuário precisa ver. O resto morre em `onTrace`. */
  onError?: (message: string) => void;
  /** Diagnóstico opcional. Sem ele o kit é silencioso — nada de console.log fixo. */
  onTrace?: (event: string, data?: Record<string, unknown>) => void;
};

export type VoiceSessionOptions = {
  endpoint: VoiceEndpoint;
  models: { transcription: string; speech: string };
  /** Id da voz como o servidor aceita, com prefixo do motor. Ex.: `piper:pt_BR-cadu-medium`. */
  voice: string;
  /** `ws://host:porta/stt/stream`. Vazio desliga o texto ao vivo; o resto continua igual. */
  streamingUrl?: string;
  /** Toca enquanto o servidor gera. Ligado por padrão — é a diferença entre responder e travar. */
  streamSpeech?: boolean;
  /** Idioma passado à transcrição. */
  language?: string;
  handlers?: VoiceSessionHandlers;
};

/** Teto da fila de transcrição. Acima disso o trecho mais antigo é descartado. */
const MAX_PENDING = 3;

/**
 * O Whisper inventa frase quando recebe silêncio ou ruído. Estes são os padrões que ele repete —
 * a legenda de fansub é a mais comum e chega a parecer que o usuário falou.
 */
const HALLUCINATIONS = [/^legendas?\b.*amara\.org/i, /^obrigad[oa]\.?$/i, /^\.{2,}$/, /^tchau\.?$/i, /^\s*$/];

/**
 * Depois de parar de falar, o microfone ainda ouve o rabo da própria fala pelos alto-falantes.
 * Esta janela engole isso.
 */
const ECHO_TAIL = 250;

export class VoiceSession {
  private options: VoiceSessionOptions;
  private state: VoiceSessionState = "idle";
  private mode: VoiceMode = "live";
  private stream: MediaStream | null = null;
  private audio: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private segmenter: UtteranceSegmenter | null = null;
  private analyzer: VoiceMetricsAnalyzer | null = null;
  private output: HTMLAudioElement | null = null;
  private live: SttStream | null = null;
  private metricsTimer = 0;
  private muted = false;
  /** Enquanto `Date.now()` for menor que isto, o microfone está ouvindo a própria assistente. */
  private speakingUntil = 0;
  private lastPartial = "";
  private readonly pending: Blob[] = [];
  private draining = false;
  private transcriptionAbort: AbortController | null = null;
  private streamingStop: (() => void) | null = null;
  private playbackGeneration = 0;

  constructor(options: VoiceSessionOptions) {
    this.options = options;
  }

  get currentState() { return this.state; }
  get isMuted() { return this.muted; }
  get isOpen() { return !!this.stream; }

  /** Troca configuração sem reabrir o microfone. Útil para trocar de voz no meio da conversa. */
  configure(patch: Partial<VoiceSessionOptions>) {
    this.options = { ...this.options, ...patch };
  }

  private trace(event: string, data?: Record<string, unknown>) {
    this.options.handlers?.onTrace?.(event, data);
  }

  private publish(next: VoiceSessionState) {
    if (this.state === next) return;
    this.state = next;
    this.options.handlers?.onState?.(next);
  }

  private fail(message: string) {
    this.options.handlers?.onError?.(message);
  }

  async start(mode: VoiceMode = "live") {
    // Sem isto, importar o kit num componente de Next.js renderizado no servidor explode em
    // `navigator is not defined` antes de chegar ao navegador.
    if (typeof navigator === "undefined" || typeof AudioContext === "undefined") {
      this.fail("O runtime de voz só existe no navegador.");
      return;
    }
    /*
     * `mediaDevices` só existe em contexto seguro: HTTPS, `localhost` ou `127.0.0.1`. Servido por
     * IP da rede em http — que é como um app do lab costuma ser aberto — o objeto simplesmente não
     * está lá, e chamar `getUserMedia` nele estoura um TypeError que vira "Não consegui abrir o
     * microfone": a pessoa fica clicando num botão que nunca vai funcionar sem saber por quê.
     */
    if (!navigator.mediaDevices?.getUserMedia) {
      const origem = typeof location === "undefined" ? "" : ` Esta página está em ${location.origin}.`;
      this.fail(`O navegador só libera o microfone em HTTPS ou em localhost.${origem}`);
      return;
    }
    if (this.stream) { this.trace("start ignorado: microfone já aberto", { mode }); return; }
    this.mode = mode;

    try {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (error) {
        /*
         * Contexto sem UI própria — documento offscreen de extensão, iframe sem `allow="microphone"`
         * — não consegue exibir o prompt de permissão, e isto falha calado: o botão de voz parece
         * quebrado sem nenhuma mensagem. A liberação tem de acontecer numa página comum antes.
         */
        const name = error instanceof DOMException ? error.name : "";
        throw new Error(
          name === "NotAllowedError" ? "O microfone não está liberado. Autorize o acesso e tente de novo."
            : name === "NotFoundError" ? "Nenhum microfone encontrado nesta máquina."
              : "Não consegui abrir o microfone.",
          { cause: error },
        );
      }

      this.audio = new AudioContext({ sampleRate: CAPTURE_SAMPLE_RATE });
      await this.audio.audioWorklet.addModule(captureWorkletUrl());
      const source = this.audio.createMediaStreamSource(this.stream);
      this.node = new AudioWorkletNode(this.audio, CAPTURE_WORKLET_NAME);
      source.connect(this.node);

      this.analyzer = new VoiceMetricsAnalyzer(this.audio, source);
      this.metricsTimer = window.setInterval(() => {
        if (!this.analyzer) return;
        this.options.handlers?.onMetrics?.(this.analyzer.sample(), this.state);
      }, 50);

      this.segmenter = new UtteranceSegmenter({
        onStart: () => { this.trace("fala começou"); if (this.mode === "live") this.publish("listening"); },
        onEnd: (chunks) => {
          const engolido = Date.now() < this.speakingUntil;
          const amostras = chunks.reduce((total, item) => total + item.length, 0);
          this.trace(engolido ? "fala ignorada (a assistente estava falando)" : "fala terminou", {
            segundos: Number((amostras / (this.audio?.sampleRate ?? CAPTURE_SAMPLE_RATE)).toFixed(2)),
          });
          if (engolido) return;
          if (this.pending.length >= MAX_PENDING) {
            this.pending.shift();
            this.fail("Transcrição atrasada; um trecho foi descartado.");
          }
          this.pending.push(encodeWav(chunks, this.audio?.sampleRate ?? CAPTURE_SAMPLE_RATE));
          void this.drain();
        },
      }, { sampleRate: this.audio.sampleRate });

      this.openLiveStream();

      this.node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (this.muted) return;
        this.segmenter?.push(event.data);
        // Enquanto a assistente fala, o microfone ouve a própria assistente: mandar isso ao texto
        // ao vivo encheria a tela com a resposta dela mesma, escrita como se fosse do usuário.
        if (Date.now() >= this.speakingUntil) this.live?.push(event.data);
      };

      await this.audio.resume();
      this.publish("listening");
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Não foi possível acessar o microfone.");
      this.stop();
    }
  }

  /**
   * O texto ao vivo é opcional por definição: sem endereço, ou com a conexão caída, a transcrição
   * em lote continua inteira. Só existe no modo `live` — no ditado o rascunho brigaria com o que a
   * pessoa já digitou no campo.
   */
  private openLiveStream() {
    const url = this.options.streamingUrl?.trim();
    if (this.mode !== "live" || !url || !this.audio) return;

    this.live = new SttStream(url, this.audio.sampleRate, {
      onReady: () => this.trace("texto ao vivo conectado", { url }),
      onPartial: (text) => {
        if (text === this.lastPartial) return;
        this.lastPartial = text;
        this.options.handlers?.onPartial?.(text);
      },
      onFinal: (text) => { this.lastPartial = ""; this.trace("trecho fechado no texto ao vivo", { texto: text }); },
      onError: (message) => this.trace("texto ao vivo falhou", { erro: message }),
    });
    this.live.open();
  }

  private async drain() {
    if (this.draining) return;
    this.draining = true;
    while (this.pending.length) {
      const blob = this.pending.shift()!;
      try {
        const controller = new AbortController();
        this.transcriptionAbort = controller;
        const timer = setTimeout(() => controller.abort(), 20_000);
        const text = await transcribeAudio(this.options.endpoint, blob, this.options.models.transcription, this.options.language, controller.signal)
          .finally(() => clearTimeout(timer));
        const clean = text.trim();
        const descartado = !clean || HALLUCINATIONS.some((pattern) => pattern.test(clean));
        this.trace(descartado ? "transcrição descartada" : "transcrição", { texto: clean, bytes: blob.size });
        if (!descartado) {
          this.options.handlers?.onTranscript?.(clean);
          if (this.mode === "live") this.publish("thinking");
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          this.fail(error instanceof Error ? error.message : "Falha ao transcrever áudio.");
        }
      } finally {
        this.transcriptionAbort = null;
      }
    }
    this.draining = false;
  }

  toggleMute() {
    this.muted = !this.muted;
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = !this.muted; });
    this.publish(this.muted ? "paused" : "listening");
    return this.muted;
  }

  stop() {
    this.playbackGeneration += 1;
    this.cancelPlayback();
    this.transcriptionAbort?.abort();
    this.transcriptionAbort = null;
    if (this.metricsTimer) window.clearInterval(this.metricsTimer);
    this.metricsTimer = 0;
    this.analyzer?.disconnect();
    this.analyzer = null;
    this.node?.port.close();
    this.node?.disconnect();
    this.node = null;
    this.segmenter = null;
    this.live?.close();
    this.live = null;
    this.lastPartial = "";
    this.pending.length = 0;
    void this.audio?.close();
    this.audio = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.muted = false;
    this.publish("idle");
  }

  /** Corta a fala no meio. É o que um botão de "parar" deve chamar. */
  stopSpeaking() {
    this.playbackGeneration += 1;
    this.cancelPlayback();
    this.speakingUntil = Date.now() + ECHO_TAIL;
    this.segmenter?.resume();
    this.publish(this.stream ? "listening" : "idle");
  }

  private cancelPlayback() {
    this.streamingStop?.();
    this.streamingStop = null;
    this.output?.pause();
    this.output = null;
  }

  /**
   * Fala um texto. Tenta streaming e cai para o arquivo inteiro se o servidor não tiver
   * `/tts/stream` — um servidor mais simples continua funcionando, só com mais espera.
   */
  async speak(text: string) {
    const spoken = speakable(text);
    if (!spoken) return;
    if (!this.options.endpoint.baseUrl.trim()) { this.fail("Servidor de voz não configurado."); return; }

    const generation = this.playbackGeneration + 1;
    this.playbackGeneration = generation;
    this.cancelPlayback();

    try {
      // Suspender o VAD evita que a própria fala abra um enunciado e vire turno do usuário.
      this.segmenter?.suspend();
      this.publish("speaking");

      if (this.options.streamSpeech !== false) {
        try {
          await this.speakStreaming(spoken);
          return;
        } catch (error) {
          if (generation !== this.playbackGeneration) return;
          this.trace("streaming caiu para arquivo inteiro", { erro: error instanceof Error ? error.message : String(error) });
        }
      }

      const blob = await synthesizeSpeech(this.options.endpoint, spoken, this.options.models.speech, this.options.voice);
      const url = URL.createObjectURL(blob);
      try {
        this.output = new Audio(url);
        await new Promise<void>((resolve, reject) => {
          this.output!.onended = () => resolve();
          this.output!.onerror = () => reject(new Error("Falha ao reproduzir a resposta."));
          void this.output!.play().catch(reject);
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      if (generation === this.playbackGeneration) {
        this.fail(error instanceof Error ? error.message : "Falha ao sintetizar voz.");
      }
    } finally {
      // Um `return` aqui apagaria a exceção que estivesse subindo; a guarda vira condição.
      if (generation === this.playbackGeneration) {
        this.speakingUntil = Date.now() + ECHO_TAIL;
        this.segmenter?.resume();
        // Sem microfone aberto, esta foi uma leitura avulsa: volta a ocioso em vez de ficar preso
        // em "falando" para sempre.
        this.publish(this.stream ? "listening" : "idle");
      }
    }
  }

  /**
   * Toca o áudio enquanto ele ainda está sendo gerado.
   *
   * Esperar o arquivo inteiro é, numa frase longa, a diferença entre responder e parecer travada.
   * Cada pedaço de PCM vira um buffer agendado na sequência, e o relógio do AudioContext costura
   * tudo sem emenda audível — `setTimeout` não serve para isso, os dois relógios correm separados.
   */
  private async speakStreaming(spoken: string) {
    const body = await streamSpeech(this.options.endpoint, spoken, this.options.voice);
    const context = new AudioContext();
    // Um analisador na saída: o que a assistente fala move o visual do mesmo jeito que a sua voz.
    const mixer = context.createGain();
    mixer.connect(context.destination);
    const meter = new VoiceMetricsAnalyzer(context, mixer);
    const meterTimer = window.setInterval(() => {
      this.options.handlers?.onMetrics?.(meter.sample(), "speaking");
    }, 50);

    const reader = body.getReader();
    let leftover = new Uint8Array(0);
    let sampleRate = 22_050;
    let channels = 1;
    let headerRead = false;
    let playAt = 0;
    const sources: AudioBufferSourceNode[] = [];

    this.streamingStop = () => {
      void reader.cancel().catch(() => undefined);
      for (const node of sources) { try { node.stop(); } catch { /* já parou */ } }
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const merged = new Uint8Array(leftover.length + value.length);
        merged.set(leftover);
        merged.set(value, leftover.length);
        let offset = 0;

        // O cabeçalho WAV chega no primeiro pedaço e traz a taxa real; assumir 22.05k daria um
        // áudio acelerado ou arrastado conforme a voz escolhida.
        if (!headerRead) {
          if (merged.length < 44) { leftover = merged; continue; }
          const header = new DataView(merged.buffer, merged.byteOffset, merged.byteLength);
          channels = header.getUint16(22, true) || 1;
          sampleRate = header.getUint32(24, true) || 22_050;
          offset = 44;
          headerRead = true;
          playAt = context.currentTime + 0.12;
        }

        // PCM de 16 bits: sobra de byte ímpar fica para o próximo pedaço.
        const usable = merged.length - offset;
        const samples = Math.floor(usable / 2 / channels) * channels;
        if (samples <= 0) { leftover = merged.subarray(offset); continue; }

        const view = new DataView(merged.buffer, merged.byteOffset + offset, samples * 2);
        const frames = samples / channels;
        const buffer = context.createBuffer(channels, frames, sampleRate);
        for (let channel = 0; channel < channels; channel += 1) {
          const target = buffer.getChannelData(channel);
          for (let frame = 0; frame < frames; frame += 1) {
            target[frame] = view.getInt16((frame * channels + channel) * 2, true) / 32768;
          }
        }

        const node = context.createBufferSource();
        node.buffer = buffer;
        node.connect(mixer);
        playAt = Math.max(playAt, context.currentTime + 0.02);
        node.start(playAt);
        playAt += buffer.duration;
        sources.push(node);

        leftover = merged.subarray(offset + samples * 2);
      }

      /*
       * Espera o fim do que já foi agendado, senão o estado volta a "ocioso" com áudio tocando.
       *
       * Quem avisa é o último buffer, por `onended`, e não um `setTimeout` calculado: o relógio do
       * AudioContext e o do `setTimeout` correm separados, e a diferença aparecia como o visual
       * continuando em "falando" depois de a fala ter acabado. O tempo calculado fica só como rede
       * de segurança, para o caso de o evento não vir.
       */
      const ultimo = sources.at(-1);
      const restante = Math.max(0, playAt - context.currentTime) * 1000;
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = (via: string) => { if (done) return; done = true; this.trace("fim da reprodução", { via }); resolve(); };
        if (ultimo) ultimo.onended = () => finish("onended");
        setTimeout(() => finish("tempo calculado"), restante + 400);
      });
    } finally {
      window.clearInterval(meterTimer);
      meter.disconnect();
      this.streamingStop = null;
      void context.close();
    }
  }
}

/**
 * O que se fala não é o que se lê: markdown e blocos de código não viram áudio.
 * O corte em 600 caracteres existe porque ninguém escuta um parágrafo inteiro sintetizado.
 */
export function speakable(text: string) {
  const clean = text
    .replace(/```[\s\S]*?```/g, " trecho de código ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > 600 ? `${clean.slice(0, 600)}…` : clean;
}
