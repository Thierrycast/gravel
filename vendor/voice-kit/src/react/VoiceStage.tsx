import { MutableRefObject } from "react";
import { VoiceIcons, defaultIcons } from "./icons";
import { VoiceOrb } from "./VoiceOrb";
import { MotionState } from "../core/motion-tokens";
import { VoiceVisualMetrics } from "../core/audio-metrics";

const LABEL: Partial<Record<MotionState, string>> = {
  listening: "Ouvindo você",
  speaking: "Falando",
  thinking: "Pensando",
  paused: "Microfone silenciado",
};

export type VoiceStageProps = {
  state: MotionState;
  metricsRef?: MutableRefObject<VoiceVisualMetrics>;
  visual?: string;
  /** Em foco o orb domina a tela; recolhido ele desce para um canto e o conteúdo volta. */
  focused: boolean;
  /** O rascunho do `useVoiceSession().partial`. Some quando o turno fecha. */
  transcript?: string;
  muted: boolean;
  signal?: string;
  accent?: string;
  onToggleFocus: () => void;
  onToggleMute: () => void;
  onClose: () => void;
  /** Troque pelos ícones do seu design system. O encaixe é 24×24 com traço de 2px. */
  icons?: Partial<VoiceIcons>;
};

/**
 * O palco da voz: o orb grande, o rótulo do estado e o rascunho do que está sendo falado.
 *
 * Em **foco**, o orb ocupa a tela e o que se ouve é o assunto. Ao tocar nele, ele encolhe e sai do
 * caminho, e o conteúdo volta a aparecer. É o gesto do ChatGPT, e funciona porque durante uma
 * conversa falada a última coisa que se quer é escolher entre ver o orb ou ver o texto.
 *
 * O mesmo componente serve aos dois estados — o que muda é só a classe, então a transição é
 * contínua em vez de uma troca de tela. **O CSS é seu**: o kit só emite os nomes de classe
 * (`voice-stage`, `focada`, `compacta`, `voice-orb`, `voice-label`, `voice-transcript`,
 * `voice-controls`, `voice-control`, `mudo`, `encerrar`). Ver ADAPTACAO.md para um ponto de partida.
 */
export function VoiceStage({
  state,
  metricsRef,
  visual,
  focused,
  transcript,
  muted,
  signal,
  accent,
  onToggleFocus,
  onToggleMute,
  onClose,
  icons,
}: VoiceStageProps) {
  const Mic = icons?.mic ?? defaultIcons.mic;
  const MicOff = icons?.micOff ?? defaultIcons.micOff;
  const Close = icons?.close ?? defaultIcons.close;

  return <div className={`voice-stage ${focused ? "focada" : "compacta"}`}>
    <button
      className="voice-orb"
      onClick={onToggleFocus}
      aria-label={focused ? "Recolher e ver o conteúdo" : "Ver a voz em foco"}
      title={focused ? "Recolher e ver o conteúdo" : "Ver a voz em foco"}
    >
      <VoiceOrb
        state={state}
        size={focused ? 190 : 46}
        metricsRef={metricsRef}
        visual={visual}
        signal={signal}
        accent={accent}
      />
    </button>

    {focused && <>
      <span className="voice-label">{LABEL[state] ?? "Ao vivo"}</span>
      {transcript && <p className="voice-transcript">{transcript}</p>}
    </>}

    <div className="voice-controls">
      <button
        className={`voice-control ${muted ? "mudo" : ""}`}
        onClick={onToggleMute}
        aria-label={muted ? "Reativar o microfone" : "Silenciar o microfone"}
      >
        {muted ? <MicOff size={16} /> : <Mic size={16} />}
      </button>
      <button className="voice-control encerrar" onClick={onClose} aria-label="Encerrar a conversa por voz">
        <Close size={16} />
      </button>
    </div>
  </div>;
}
