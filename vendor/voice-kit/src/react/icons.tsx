/**
 * Ícones em SVG inline.
 *
 * O kit **não depende de biblioteca de ícones**. Quatro ícones não justificam obrigar todo app a
 * instalar `lucide-react` (e a lidar com a versão dela, e com o tree-shaking dela). Os traços aqui
 * seguem o mesmo desenho de 24×24 com traço de 2px que quase toda biblioteca usa, então trocar
 * pelos do seu design system é passar a prop `icons` — o encaixe visual já está certo.
 */

import type { ReactElement } from "react";

export type IconProps = { size?: number };
export type VoiceIcons = {
  mic: (props: IconProps) => ReactElement;
  micOff: (props: IconProps) => ReactElement;
  close: (props: IconProps) => ReactElement;
  reset: (props: IconProps) => ReactElement;
};

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export function MicIcon({ size = 16 }: IconProps) {
  return <svg {...base(size)}>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </svg>;
}

export function MicOffIcon({ size = 16 }: IconProps) {
  return <svg {...base(size)}>
    <line x1="2" y1="2" x2="22" y2="22" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
    <path d="M15 9.34V5a3 3 0 0 0-5.94-.6" />
    <path d="M19 10v2a7 7 0 0 1-11.79 5.1" />
    <path d="M5 10v2a7 7 0 0 0 .3 2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </svg>;
}

export function CloseIcon({ size = 16 }: IconProps) {
  return <svg {...base(size)}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>;
}

export function ResetIcon({ size = 14 }: IconProps) {
  return <svg {...base(size)}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <polyline points="3 4 3 9 8 9" />
  </svg>;
}

export const defaultIcons: VoiceIcons = {
  mic: MicIcon,
  micOff: MicOffIcon,
  close: CloseIcon,
  reset: ResetIcon,
};
