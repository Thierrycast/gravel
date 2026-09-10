import { useEffect, useRef } from "react";
import { VISUALS, VisualId } from "../visuals/voice-visuals";
import { VoiceVisual, shadersAvailable } from "../visuals/gl-visual";
import { MotionState } from "../core/motion-tokens";
import { VoiceVisualMetrics } from "../core/audio-metrics";

const CICLO: MotionState[] = ["listening", "speaking", "thinking", "acting"];

/**
 * Escolher o visual por uma lista de nomes seria adivinhação: "Liquid Blob" e "Energy Field" não
 * dizem nada. Cada opção aqui mostra a si mesma, animada, passeando sozinha pelos estados com um
 * sinal sintético — o usuário escolhe vendo, não lendo.
 *
 * `hide` remove opções que não fazem sentido no seu app. Exemplo real: `["ambient-edge"]`, que
 * acende a moldura da tela em vez de desenhar um objeto e por isso não cabe numa miniatura.
 *
 * O CSS é seu. As classes emitidas são `visual-picker`, `visual-option`, `chosen`, `visual-stage`
 * e `visual-canvas`.
 */
export function VisualPicker({ value, onChange, hide }: { value: string; onChange: (visual: VisualId) => void; hide?: string[] }) {
  return <div className="visual-picker">
    {VISUALS.filter((item) => !(hide ?? []).includes(item.id)).map((item) => (
      <button
        key={item.id}
        type="button"
        className={`visual-option ${value === item.id ? "chosen" : ""}`}
        aria-pressed={value === item.id}
        onClick={() => onChange(item.id)}
      >
        <VisualPreview id={item.id} />
        <span>
          <strong>{item.name.replace(/^\d+ · /, "")}</strong>
          <small>{item.technique}</small>
        </span>
      </button>
    ))}
  </div>;
}

/** Cada miniatura roda seu próprio loop e cicla os estados sozinha, para mostrar o caráter. */
function VisualPreview({ id }: { id: VisualId }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const visualRef = useRef<VoiceVisual | null>(null);
  // O aviso de falha é alternado por ref: virar estado obrigaria a chamar setState dentro do
  // efeito, e a mensagem não participa de mais nada no render.
  const noticeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const entry = VISUALS.find((item) => item.id === id);
    if (!entry) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const show = (visible: boolean) => { if (noticeRef.current) noticeRef.current.hidden = !visible; };
    if (entry.webgl && !shadersAvailable()) { show(true); return; }
    const canvas = document.createElement("canvas");
    host.replaceChildren(canvas);
    const visual = entry.create(canvas, { reducedMotion: reduced });
    show("ok" in visual && !(visual as { ok: boolean }).ok);
    visual.start();
    visualRef.current = visual;

    const observer = new ResizeObserver(() => visual.resize());
    observer.observe(canvas);

    // Sinal sintético só para a miniatura respirar: sem microfone, nada se moveria.
    let raf = 0;
    const inicio = performance.now();
    const pulso = () => {
      const segundos = (performance.now() - inicio) / 1000;
      const onda = (Math.sin(segundos * 1.7) * 0.5 + 0.5) * (Math.sin(segundos * 0.6) * 0.5 + 0.5);
      const metrics: VoiceVisualMetrics = { energy: onda * 0.8, bass: onda * 0.6, mid: onda * 0.75, high: onda * 0.4, speaking: onda > 0.2 };
      visual.setMetrics(metrics);
      raf = requestAnimationFrame(pulso);
    };
    pulso();

    let passo = 0;
    visual.setState(CICLO[0]);
    const relogio = window.setInterval(() => { passo += 1; visual.setState(CICLO[passo % CICLO.length]); }, 2600);

    return () => { cancelAnimationFrame(raf); window.clearInterval(relogio); observer.disconnect(); visual.destroy(); visualRef.current = null; host.replaceChildren(); };
  }, [id]);

  return <span className="visual-stage">
    <span className="visual-canvas" ref={hostRef} />
    <em ref={noticeRef} hidden>sem WebGL</em>
  </span>;
}
