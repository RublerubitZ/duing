/* shared.jsx → TypeScript 변환
   Sparkle, SparkleFull */

import type React from 'react';

/* ============================================================
   Sparkle
   ============================================================ */
type SparkleProps = {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
};

export function Sparkle({ size = 16, color = '#9DB6A0', className = '', style = {} }: SparkleProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
      aria-hidden="true"
    >
      <g stroke={color} strokeLinecap="round" strokeWidth="2.2">
        <line x1="12"  y1="2"   x2="12"  y2="6" />
        <line x1="20" y1="5"   x2="17"  y2="8" />
        <line x1="22"  y1="12"  x2="18" y2="12" />
        <line x1="20" y1="19"  x2="17"  y2="16" />
      </g>
    </svg>
  );
}

/* ============================================================
   SparkleFull
   ============================================================ */
type SparkleFullProps = {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
};

export function SparkleFull({ size = 24, color = '#9DB6A0', className = '', style = {} }: SparkleFullProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      style={style}
      aria-hidden="true"
    >
      <g stroke={color} strokeLinecap="round" strokeWidth="2.4">
        <line x1="16" y1="2"  x2="16" y2="7" />
        <line x1="27" y1="6"  x2="23" y2="10" />
        <line x1="30" y1="16" x2="25" y2="16" />
        <line x1="27" y1="26" x2="23" y2="22" />
        <line x1="16" y1="30" x2="16" y2="25" />
        <line x1="5"  y1="26" x2="9"  y2="22" />
        <line x1="2"  y1="16" x2="7"  y2="16" />
        <line x1="5"  y1="6"  x2="9"  y2="10" />
      </g>
    </svg>
  );
}

