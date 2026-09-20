/**
 * O AudioWorklet de captura, embutido como texto.
 *
 * Por que não um arquivo em `public/`: `addModule` precisa de uma URL, e cada stack resolve URL de
 * um jeito diferente — a extensão usava `chrome.runtime.getURL`, Vite quer o arquivo em `public/`,
 * Next quer outro caminho ainda, e vanilla depende de onde você serviu. Cada integração virava uma
 * pergunta de deploy, e quando a resposta estava errada o microfone falhava calado.
 *
 * Como string mais Blob URL, o worklet viaja no bundle e a pergunta deixa de existir. O custo é
 * ~700 bytes e não poder depurar o worklet por arquivo no DevTools — troca que vale.
 */

/**
 * Blocos de 320 amostras (20 ms a 16 kHz). O `process` do worklet recebe 128 quadros por vez, o
 * que daria ~125 mensagens por segundo para a thread principal; reagrupar em 20 ms corta isso para
 * 50 e ainda é fino o suficiente para o VAD detectar início de fala sem atraso perceptível.
 */
export const CAPTURE_BLOCK_SIZE = 320;

/** Taxa que o servidor de fato responde no `/stt/stream`. Ver INTEGRACAO.md. */
export const CAPTURE_SAMPLE_RATE = 16_000;

export const CAPTURE_WORKLET_NAME = "voice-capture";

const SOURCE = `
// Script clássico: o escopo de AudioWorklet não suporta import.
class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pending = [];
    this.pendingFrames = 0;
    this.blockSize = ${CAPTURE_BLOCK_SIZE};
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    this.pending.push(new Float32Array(channel));
    this.pendingFrames += channel.length;
    if (this.pendingFrames >= this.blockSize) {
      const merged = new Float32Array(this.pendingFrames);
      let offset = 0;
      for (const chunk of this.pending) { merged.set(chunk, offset); offset += chunk.length; }
      this.pending = [];
      this.pendingFrames = 0;
      // Transfere o buffer em vez de copiar: 50 cópias por segundo viram lixo para o GC.
      this.port.postMessage(merged, [merged.buffer]);
    }
    return true;
  }
}

registerProcessor(${JSON.stringify(CAPTURE_WORKLET_NAME)}, VoiceCaptureProcessor);
`;

let cached: string | null = null;

/**
 * URL do worklet, criada uma vez por página. Não é revogada de propósito: o `AudioContext` pode
 * pedir o módulo de novo depois de um `resume`, e uma URL revogada faria `addModule` falhar num
 * ponto onde ninguém está olhando.
 */
export function captureWorkletUrl(): string {
  if (cached) return cached;
  cached = URL.createObjectURL(new Blob([SOURCE], { type: "application/javascript" }));
  return cached;
}

/** Para quem preferir servir o worklet como arquivo estático — escreva isto em `public/`. */
export const captureWorkletSource = SOURCE;
