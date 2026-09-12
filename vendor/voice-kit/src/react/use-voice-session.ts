import { MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { VoiceSession, VoiceSessionOptions, VoiceSessionState, VoiceMode } from "../core/voice-session";
import { VoiceVisualMetrics, emptyVoiceMetrics } from "../core/audio-metrics";

export type UseVoiceSession = {
  state: VoiceSessionState;
  /**
   * O áudio já suavizado, **num ref**. Passe para `<VoiceOrb metricsRef={...}>`.
   * Ver o comentário do hook para o porquê de não ser estado.
   */
  metricsRef: MutableRefObject<VoiceVisualMetrics>;
  /** Rascunho do que está sendo falado. Some quando o turno fecha. Não é comando. */
  partial: string;
  muted: boolean;
  /** Microfone aberto. Use para decidir se mostra o palco de voz. */
  open: boolean;
  error: string | null;
  start: (mode?: VoiceMode) => Promise<void>;
  stop: () => void;
  toggleMute: () => void;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
};

/**
 * O `VoiceSession` empacotado em estado de React.
 *
 * Três coisas que este hook resolve, e que dão errado quando cada app refaz:
 *
 * 1. **A sessão vive num ref, não em estado.** Ela é um objeto com microfone aberto e AudioContext;
 *    recriá-la a cada render derrubaria o microfone no meio da frase. Mudanças de configuração
 *    entram por `configure`, sem reabrir nada.
 * 2. **As métricas não passam por estado.** Chegam 20 vezes por segundo — em estado, isso
 *    re-renderiza a árvore inteira nessa cadência e o app trava com um orb bonito. O analisador
 *    devolve sempre o *mesmo objeto* mutado no lugar, então um ref basta: o `<VoiceOrb>` lê o valor
 *    vivo dentro do próprio `requestAnimationFrame`. Se você precisar do número na tela (medidor,
 *    contador), copie para estado num intervalo mais lento, tipo 4 Hz.
 * 3. **Fechar a aba com o microfone aberto** deixa a luz do microfone acesa no sistema. O cleanup
 *    do hook fecha a sessão.
 *
 * `onTranscript` é onde o seu app abre um turno. É o único callback que importa de verdade: sem
 * ele, a voz vira enfeite.
 */
export function useVoiceSession(
  options: VoiceSessionOptions & { onTranscript?: (text: string) => void },
): UseVoiceSession {
  const [state, setState] = useState<VoiceSessionState>("idle");
  const [partial, setPartial] = useState("");
  const [muted, setMuted] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const metricsRef = useRef<VoiceVisualMetrics>(emptyVoiceMetrics());

  // Os callbacks do app mudam a cada render; a sessão precisa sempre do mais recente sem ser
  // recriada. Guardá-los em ref é o que permite a sessão nascer uma única vez.
  const handlersRef = useRef(options);
  const sessionRef = useRef<VoiceSession | null>(null);

  useEffect(() => { handlersRef.current = options; }, [options]);

  useEffect(() => {
    const session = new VoiceSession({
      ...handlersRef.current,
      handlers: {
        onTrace: (event, data) => handlersRef.current.handlers?.onTrace?.(event, data),
        onState: (next) => { setState(next); handlersRef.current.handlers?.onState?.(next); },
        onMetrics: (metrics, estado) => {
          metricsRef.current = metrics;
          handlersRef.current.handlers?.onMetrics?.(metrics, estado);
        },
        onPartial: (text) => { setPartial(text); handlersRef.current.handlers?.onPartial?.(text); },
        onTranscript: (text) => {
          setPartial("");
          handlersRef.current.onTranscript?.(text);
          handlersRef.current.handlers?.onTranscript?.(text);
        },
        onError: (message) => { setError(message); handlersRef.current.handlers?.onError?.(message); },
      },
    });
    sessionRef.current = session;
    return () => {
      session.stop();
      sessionRef.current = null;
    };
  }, []);

  // Endpoint, voz e modelos podem mudar nas preferências do app sem reabrir o microfone.
  useEffect(() => {
    sessionRef.current?.configure({
      endpoint: options.endpoint,
      models: options.models,
      voice: options.voice,
      streamingUrl: options.streamingUrl,
      streamSpeech: options.streamSpeech,
      language: options.language,
    });
  }, [options.endpoint, options.models, options.voice, options.streamingUrl, options.streamSpeech, options.language]);

  const start = useCallback(async (mode: VoiceMode = "live") => {
    setError(null);
    await sessionRef.current?.start(mode);
    setOpen(!!sessionRef.current?.isOpen);
  }, []);

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    setOpen(false);
    setPartial("");
    setMuted(false);
  }, []);

  const toggleMute = useCallback(() => { setMuted(sessionRef.current?.toggleMute() ?? false); }, []);
  const speak = useCallback(async (text: string) => { await sessionRef.current?.speak(text); }, []);
  const stopSpeaking = useCallback(() => sessionRef.current?.stopSpeaking(), []);

  return { state, metricsRef, partial, muted, open, error, start, stop, toggleMute, speak, stopSpeaking };
}
