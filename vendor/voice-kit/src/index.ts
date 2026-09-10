/**
 * Voice Kit — o stack de voz extraído da Vela.
 *
 * Três camadas, e você usa só a que precisa:
 *
 * - **`core`** não depende de framework nem de DOM além do que o áudio exige. É o motor.
 * - **`visuals`** desenha em canvas/WebGL. Sem React.
 * - **`react`** é açúcar em cima dos dois. Se o seu app não é React, importe de `voice-kit/vanilla`.
 *
 * Este arquivo reexporta tudo por conveniência. Em Next.js prefira importar dos caminhos fundos
 * (`voice-kit/src/core/speech-api`) para não arrastar React nem WebGL para o bundle do servidor —
 * ver INTEGRACAO.md.
 */

// ── núcleo ────────────────────────────────────────────────────────────────────
export { VoiceSession, speakable } from "./core/voice-session";
export type {
  VoiceSessionState, VoiceSessionOptions, VoiceSessionHandlers, VoiceMode,
} from "./core/voice-session";

export {
  listVoices, checkVoiceEndpoint, transcribeAudio, streamSpeech, synthesizeSpeech,
} from "./core/speech-api";
export type { VoiceEndpoint, VoiceOption, ConnectionCheck } from "./core/speech-api";

export { SttStream } from "./core/stt-stream";
export { UtteranceSegmenter } from "./core/vad";
export type { UtteranceEvents, VadOptions } from "./core/vad";
export { VoiceMetricsAnalyzer, emptyVoiceMetrics } from "./core/audio-metrics";
export type { VoiceVisualMetrics } from "./core/audio-metrics";
export { encodeWav } from "./core/wav-encoder";
export { motionTokens } from "./core/motion-tokens";
export type { MotionState } from "./core/motion-tokens";
export {
  captureWorkletUrl, captureWorkletSource, CAPTURE_SAMPLE_RATE, CAPTURE_BLOCK_SIZE, CAPTURE_WORKLET_NAME,
} from "./core/worklet";

// ── visuais ───────────────────────────────────────────────────────────────────
export {
  VISUALS, AmbientEdgeVisual, CUSTOM_STARTER, setCustomShader, getCustomShader,
} from "./visuals/voice-visuals";
export type { VisualId, VisualEntry } from "./visuals/voice-visuals";
export {
  ShaderVisual, shadersAvailable, setVoicePalette, STATE_MOOD, STATE_CHARACTER, GLSL_PRELUDE,
} from "./visuals/gl-visual";
export type { VoiceVisual, ShaderVisualOptions, VoicePalette, StateCharacter } from "./visuals/gl-visual";
export { ParticleOrbRenderer } from "./visuals/orb-renderer";

// ── react ─────────────────────────────────────────────────────────────────────
export { useVoiceSession } from "./react/use-voice-session";
export type { UseVoiceSession } from "./react/use-voice-session";
export { VoiceOrb } from "./react/VoiceOrb";
export type { VoiceOrbProps } from "./react/VoiceOrb";
export { VoiceStage } from "./react/VoiceStage";
export type { VoiceStageProps } from "./react/VoiceStage";
export { VisualPicker } from "./react/VisualPicker";
export { ShaderEditor } from "./react/ShaderEditor";
export { defaultIcons, MicIcon, MicOffIcon, CloseIcon, ResetIcon } from "./react/icons";
export type { VoiceIcons, IconProps } from "./react/icons";
