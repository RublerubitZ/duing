import type { SVGProps } from 'react';

type Props = {
  size?: number;
  color?: string;
} & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>;

export function Sparkle({ size = 16, color = '#9DB6A0', ...rest }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...rest}>
      <g stroke={color} strokeLinecap="round" strokeWidth="2.2">
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="20" y1="5" x2="17" y2="8" />
        <line x1="22" y1="12" x2="18" y2="12" />
        <line x1="20" y1="19" x2="17" y2="16" />
      </g>
    </svg>
  );
}

export function SparkleFull({ size = 24, color = '#9DB6A0', ...rest }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden {...rest}>
      <g stroke={color} strokeLinecap="round" strokeWidth="2.4">
        <line x1="16" y1="2" x2="16" y2="7" />
        <line x1="27" y1="6" x2="23" y2="10" />
        <line x1="30" y1="16" x2="25" y2="16" />
        <line x1="27" y1="26" x2="23" y2="22" />
        <line x1="16" y1="30" x2="16" y2="25" />
        <line x1="5" y1="26" x2="9" y2="22" />
        <line x1="2" y1="16" x2="7" y2="16" />
        <line x1="5" y1="6" x2="9" y2="10" />
      </g>
    </svg>
  );
}
