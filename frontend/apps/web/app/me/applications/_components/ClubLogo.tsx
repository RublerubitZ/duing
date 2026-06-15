/* a-apply-status.jsx → TypeScript 변환: ClubLogo */

import type React from 'react';
import type { Logo } from '../_constants/data';

type Props = {
  logo: Logo;
  size?: number;
};

export function ClubLogo({ logo, size = 64 }: Props) {
  const { kind, bg, fg } = logo;
  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: '50%',
    background: bg, color: fg,
    display: 'grid', placeItems: 'center',
    flexShrink: 0,
    fontFamily: 'var(--font-display)',
    letterSpacing: '0.02em',
    overflow: 'hidden',
    position: 'relative',
  };

  if (kind === 'wordmark') {
    return (
      <div style={base}>
        <span style={{ fontSize: size * 0.22, fontWeight: 700 }}>{logo.text}</span>
      </div>
    );
  }
  if (kind === 'mountain') {
    return (
      <div style={{ ...base, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
        <svg width={size * 0.4} height={size * 0.22} viewBox="0 0 40 22" fill="none">
          <path d="M2 20 L14 4 L22 14 L28 8 L38 20 Z"
                stroke={fg} strokeWidth="1.6" strokeLinejoin="round" fill="none" />
        </svg>
        <span style={{ fontSize: size * 0.14, fontWeight: 700, letterSpacing: '0.18em' }}>{logo.text}</span>
      </div>
    );
  }
  if (kind === 'alpha') {
    return (
      <div style={base}>
        <span style={{ fontSize: size * 0.5, fontWeight: 500, fontFamily: 'Georgia, serif', lineHeight: 1 }}>
          {logo.text}
        </span>
      </div>
    );
  }
  if (kind === 'stack') {
    return (
      <div style={{ ...base, flexDirection: 'column', gap: 0, lineHeight: 1 }}>
        {(logo.lines ?? []).map((line, i) => (
          <span key={i} style={{ fontSize: size * 0.18, fontWeight: 700, letterSpacing: '0.04em' }}>{line}</span>
        ))}
      </div>
    );
  }
  if (kind === 'img' && logo.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo.url} alt="" loading="lazy" decoding="async" style={{ ...base, objectFit: 'cover' }} />
    );
  }
  return <div style={base} />;
}
