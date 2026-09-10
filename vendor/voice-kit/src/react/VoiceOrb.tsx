import { MutableRefObject, useEffect, useRef } from "react";
import { VISUALS, VisualId } from "../visuals/voice-visuals";
import { ParticleOrbRenderer } from "../visuals/orb-renderer";
import { VoiceVisual, shadersAvailable } from "../visuals/gl-visual";
import { MotionState } from "../core/motion-tokens";
import { VoiceVisualMetrics, emptyVoiceMetrics } from "../core/audio-metrics";

export type VoiceOrbProps = {
  /** O estado da conversa. É o que troca cor e ritmo — ver `STATE_MOOD` em gl-visual.ts. */
  state: MotionState;
  /** Lado do quadrado, em px. Abaixo de 24 o kit usa o renderer 2D e ignora o shader. */
  size?: number;
  /** O ref que vem de `useVoiceSession().metricsRef`. Lido a cada quadro, sem passar pelo React. */
  metricsRef?: MutableRefObject<VoiceVisualMetrics>;
  /** Qual dos visuais. Sem isto, o orb de partículas em canvas 2D. */
  visual?: VisualId | string;
  /** Cor da marca; entra como `uSignal` no shader. */
  signal?: string;
  /** Cor secundária; entra como `uAccent`. */
  accent?: string;
  className?: string;
  /**
   * Diz qual renderer realmente subiu. Ligue no seu log durante a integração: sem isto, "o orb não
   * reage" fica indistinguível de "o shader não compilou e caiu na reserva 2D" — parecem a mesma
   * coisa na tela e têm causas opostas.
   */
  onMounted?: (info: { visual: string; fallback: boolean; webgl: boolean }) => void;
};

/**
 * O visual reagindo ao áudio. É o componente que justifica o kit.
 *
 * Duas decisões que parecem estranhas e não são:
 *
 * **1. O canvas é criado fora do React**, com `document.createElement` e `replaceChildren`, em vez
 * de ficar no JSX. Um canvas só aceita um tipo de contexto para sempre: depois de um
 * `getContext("webgl")`, o mesmo elemento devolve `null` em `getContext("2d")`. Quando o canvas era
 * gerenciado pelo React, trocar de visual reexecutava o efeito com o canvas já queimado pelo
 * contexto anterior, o renderer de reserva lançava e derrubava a tela inteira. Criar um elemento
 * novo por montagem é o que evita isso — e é por isso que a troca de visual reconstrói o canvas.
 *
 * **2. As métricas entram por ref e por `requestAnimationFrame`**, não por prop. Elas chegam 20
 * vezes por segundo; em prop, cada amostra re-renderizaria a árvore acima do orb. Aqui o loop lê o
 * valor vivo e escreve direto no renderer, e o React não participa da animação.
 */
export function VoiceOrb({
  state,
  size = 34,
  metricsRef,
  visual,
  signal,
  accent,
  className,
  onMounted,
}: VoiceOrbProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const rendererRef = useRef<VoiceVisual | null>(null);
  const vazio = useRef<VoiceVisualMetrics>(emptyVoiceMetrics());

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof window === "undefined") return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Abaixo de 24px o shader é desperdício: nesse tamanho nada do detalhe aparece.
    const entry = size >= 24 ? VISUALS.find((item) => item.id === visual) : undefined;

    const build = () => {
      const canvas = document.createElement("canvas");
      host.replaceChildren(canvas);
      return canvas;
    };

    let renderer: VoiceVisual | null = null;
    let canvas = build();
    if (entry && (!entry.webgl || shadersAvailable())) {
      const candidate = entry.create(canvas, { signal, accent, reducedMotion: reduced });
      if (!("ok" in candidate) || (candidate as { ok: boolean }).ok) renderer = candidate;
      else {
        // O shader não compilou e o canvas ficou preso ao contexto WebGL: o de reserva precisa de
        // um elemento novo, senão getContext("2d") devolve null e lança.
        candidate.destroy();
        canvas = build();
      }
    }
    const fallback = !renderer;
    const active = renderer ?? new ParticleOrbRenderer(canvas, { color: signal, reducedMotion: reduced });
    onMounted?.({ visual: visual ?? "(nenhum)", fallback, webgl: entry?.webgl ?? false });

    active.start();
    active.setState(state);
    rendererRef.current = active;

    const observer = new ResizeObserver(() => active.resize());
    observer.observe(canvas);
    // Fora da tela o loop continuaria queimando GPU numa aba que ninguém está vendo.
    const visibility = new IntersectionObserver(([item]) => active.setVisible(item.isIntersecting));
    visibility.observe(canvas);

    let frame = 0;
    const pump = () => {
      active.setMetrics(metricsRef?.current ?? vazio.current);
      frame = requestAnimationFrame(pump);
    };
    frame = requestAnimationFrame(pump);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      active.destroy();
      rendererRef.current = null;
      host.replaceChildren();
    };
    // `state` entra só na montagem; mudanças dele são aplicadas pelo efeito seguinte, senão cada
    // troca de estado reconstruiria o canvas e o shader recompilaria no meio da conversa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visual, size, signal, accent]);

  useEffect(() => { rendererRef.current?.setState(state); }, [state]);

  return <span
    ref={hostRef}
    className={className ?? "voice-orb-canvas"}
    style={{ width: size, height: size, display: "inline-block" }}
    role="img"
    aria-label={`Voz: ${state}`}
  />;
}
