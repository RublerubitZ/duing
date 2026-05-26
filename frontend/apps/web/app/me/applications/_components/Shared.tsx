/* shared.jsx → TypeScript 변환
   Sparkle, SparkleFull, BrandMark, Icon */

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

export const Sparkle = ({ size = 16, color = '#9DB6A0', className = '', style = {} }: SparkleProps) => (
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

/* ============================================================
   SparkleFull
   ============================================================ */
type SparkleFullProps = {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
};

export const SparkleFull = ({ size = 24, color = '#9DB6A0', className = '', style = {} }: SparkleFullProps) => (
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

/* ============================================================
   BrandMark
   ============================================================ */
type BrandMarkProps = {
  size?: number;
  light?: boolean;
};

export const BrandMark = ({ size = 26, light = false }: BrandMarkProps) => (
  <span className="brand-mark" style={{ fontSize: size }}>
    <span className="b-d" style={light ? { color: '#fff' } : undefined}>D</span>
    <span className="b-u">u</span>
    <span className="b-ing" style={light ? { color: 'rgba(255,255,255,.92)' } : undefined}>ing</span>
    <span className="b-spark"><Sparkle size={size * 0.6} color="#9DB6A0" /></span>
  </span>
);

/* ============================================================
   Icon — 지원현황 페이지에서 사용하는 아이콘만 포함
   ============================================================ */
type IconProps = React.SVGProps<SVGSVGElement>;

export const Icon = {
  search: (p: IconProps) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  ),
  bell: (p: IconProps) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
};
