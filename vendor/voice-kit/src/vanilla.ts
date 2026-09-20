/**
 * O kit sem React.
 *
 * O núcleo e os visuais nunca dependeram de framework — a camada React é açúcar. Este arquivo é o
 * equivalente do `useVoiceSession` + `<VoiceOrb>` em classe, e serve tanto para app vanilla quanto
 * para Vue, Svelte ou Angular: monte `mountVoiceOrb` num elemento e ligue os callbacks.
 *
 * ```ts
 * import { VoiceSession, mountVoiceOrb } from "voice-kit/src/vanilla";
 *
 * const orb = mountVoiceOrb(document.querySelector("#orb")!, { visual: "liquid-blob" });
 * const voz = new VoiceSession({
 *   endpoint: { baseUrl: "http://<host-do-lab>:8010", apiKey: "" },
 *   models: { transcription: "groq/whisper-large-v3-turbo", speech: "tts-1" },
 *   voice: "piper:pt_BR-cadu-medium",
 *   streamingUrl: "ws://<host-do-lab>:8010/stt/stream",
 *   handlers: {
 *     onState: (estado) => orb.setState(estado),
 *     onMetrics: (metrics) => orb.setMetrics(metrics),
 *     onPartial: (texto) => { rascunho.textContent = texto; },
 *     onTranscript: (texto) => enviarParaOModelo(texto),
 *     onError: (msg) => alerta(msg),
 *   },
 * });
 * await voz.start("live");
 * ```
 */

import { VISUALS } from "./visuals/voice-visuals";
import { ParticleOrbRenderer } from "./visuals/orb-renderer";
import { VoiceVisual, shadersAvailable } from "./visuals/gl-visual";
import { MotionState } from "./core/motion-tokens";
import { VoiceVisualMetrics } from "./core/audio-metrics";

export { VoiceSession, speakable } from "./core/voice-session";
export type { VoiceSessionOptions, VoiceSessionState, VoiceMode } from "./core/voice-session";
export * from "./core/speech-api";
export { setVoicePalette, setCustomShader, VISUALS, shadersAvailable } from "./index";

export type MountedOrb = {
  setState(state: MotionState): void;
  setMetrics(metrics: VoiceVisualMetrics): void;
  /** Qual renderer subiu de fato. Olhe isto quando "o orb não reage". */
  readonly info: { visual: string; fallback: boolean };
  destroy(): void;
};

/**
 * Monta um visual num elemento e devolve o controle dele.
 *
 * Carrega as mesmas duas lições do `<VoiceOrb>`: o canvas é criado aqui dentro (um canvas só aceita
 * um tipo de contexto para sempre, então o renderer de reserva precisa de um elemento novo), e o
 * observador de visibilidade evita queimar GPU numa aba que ninguém está vendo.
 */
export function mountVoiceOrb(
  host: HTMLElement,
  options: { visual?: string; signal?: string; accent?: string; reducedMotion?: boolean } = {},
): MountedOrb {
  const reduced = options.reducedMotion ?? (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const entry = VISUALS.find((item) => item.id === options.visual);

  const build = () => {
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    host.replaceChildren(canvas);
    return canvas;
  };

  let renderer: VoiceVisual | null = null;
  let canvas = build();
  if (entry && (!entry.webgl || shadersAvailable())) {
    const candidate = entry.create(canvas, { signal: options.signal, accent: options.accent, reducedMotion: reduced });
    if (!("ok" in candidate) || (candidate as { ok: boolean }).ok) renderer = candidate;
    else { candidate.destroy(); canvas = build(); }
  }
  const fallback = !renderer;
  const active = renderer ?? new ParticleOrbRenderer(canvas, { color: options.signal, reducedMotion: reduced });

  active.start();
  const observer = new ResizeObserver(() => active.resize());
  observer.observe(canvas);
  const visibility = new IntersectionObserver(([item]) => active.setVisible(item.isIntersecting));
  visibility.observe(canvas);

  return {
    setState: (state) => active.setState(state),
    setMetrics: (metrics) => active.setMetrics(metrics),
    info: { visual: options.visual ?? "(nenhum)", fallback },
    destroy: () => {
      observer.disconnect();
      visibility.disconnect();
      active.destroy();
      host.replaceChildren();
    },
  };
}
