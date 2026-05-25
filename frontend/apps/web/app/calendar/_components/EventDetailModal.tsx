'use client';

import type { AccentKey, AccentStyle, CalEvent } from '../_types';

type Props = {
  event: CalEvent;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

const ACCENT: Record<AccentKey, AccentStyle> = {
  ink:   { dot: 'var(--ink)',   bg: 'var(--sage-mist)', fg: 'var(--ink-deep)' },
  coral: { dot: '#D97757',      bg: '#FCE2D9',           fg: '#9A3F23'         },
  warm:  { dot: '#E8B968',      bg: '#FBEFD7',           fg: '#8E6620'         },
  berry: { dot: '#B65672',      bg: '#F6DCE3',           fg: '#7E2A45'         },
  sage:  { dot: 'var(--sage)',  bg: 'var(--sage-tint)',  fg: 'var(--ink-deep)' },
  sky:   { dot: '#6A95B8',      bg: '#DDE8F1',           fg: '#2F557A'         },
};

const KIND_LABEL: Record<string, string> = {
  notice:    '공지',
  deadline:  '모집 마감',
  fair:      '박람회',
  show:      '공연·전시',
  meet:      '정기 모임',
  volunteer: '봉사',
};

function PinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function CalendarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

function FileTextIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const dateKR = (iso: string): string => {
  const parts = iso.split('-').map(Number);
  const y = parts[0] ?? 0, m = parts[1] ?? 1, d = parts[2] ?? 1;
  const dow = new Date(y, m - 1, d).getDay();
  const dowKR = (['일', '월', '화', '수', '목', '금', '토'][dow]) ?? '';
  return `${y}. ${String(m).padStart(2, '0')}. ${String(d).padStart(2, '0')} (${dowKR})`;
};

const ROW_STYLE: React.CSSProperties = {
  display: 'flex', gap: 14, alignItems: 'flex-start',
};

const ICON_COL: React.CSSProperties = {
  width: 18, height: 18, flexShrink: 0, marginTop: 2,
  color: 'var(--charcoal-3)',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 700, color: 'var(--charcoal-3)', marginBottom: 3,
};

export function EventDetailModal({ event, open, onClose, onEdit, onDelete }: Props) {
  if (!open) return null;

  const a = ACCENT[event.accent] ?? ACCENT.ink;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 150,
        background: 'rgba(31,32,30,0.42)',
        display: 'grid', placeItems: 'center',
        padding: 16,
        animation: 'duing-dtl-fade .18s ease',
      }}
    >
      <style>{`
        @keyframes duing-dtl-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes duing-dtl-pop {
          from { opacity: 0; transform: translateY(8px) scale(.97) }
          to   { opacity: 1; transform: translateY(0) scale(1) }
        }
      `}</style>
      <div
        className="duing"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-detail-title"
        style={{
          width: '100%',
          maxWidth: 420,
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
          background: '#fff',
          borderRadius: 24,
          border: '1px solid var(--gray-line)',
          boxShadow: '0 24px 60px rgba(31,74,54,0.20)',
          padding: '24px 28px 24px',
          position: 'relative',
          animation: 'duing-dtl-pop .22s cubic-bezier(.22,.61,.36,1)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 999,
              background: a.bg, color: a.fg,
              fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em',
              marginBottom: 10,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: a.dot }} />
              {KIND_LABEL[event.kind] ?? event.kind}
            </span>
            <h2 id="event-detail-title" style={{
              fontSize: 20, fontWeight: 700, color: 'var(--ink-deep)', lineHeight: 1.3,
              wordBreak: 'keep-all',
            }}>
              {event.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              flexShrink: 0, marginLeft: 12,
              width: 32, height: 32, borderRadius: 999,
              border: 'none', background: 'transparent',
              color: 'var(--charcoal-2)',
              display: 'grid', placeItems: 'center', cursor: 'pointer',
            }}
          >
            <CloseIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ height: 1, background: 'var(--gray-line)', marginBottom: 20 }} />

        {/* Detail rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 26 }}>
          {/* 장소 */}
          <div style={ROW_STYLE}>
            <PinIcon style={ICON_COL} />
            <div>
              <div style={LABEL_STYLE}>장소</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-deep)' }}>{event.place}</div>
            </div>
          </div>

          {/* 날짜 */}
          <div style={ROW_STYLE}>
            <CalendarIcon style={ICON_COL} />
            <div>
              <div style={LABEL_STYLE}>날짜</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-deep)' }}>{dateKR(event.date)}</div>
            </div>
          </div>

          {/* 시간 */}
          {event.time && (
            <div style={ROW_STYLE}>
              <ClockIcon style={ICON_COL} />
              <div>
                <div style={LABEL_STYLE}>시간</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-deep)', fontFamily: 'var(--font-mono)' }}>
                  {event.time}
                </div>
              </div>
            </div>
          )}

          {/* 상세 설명 */}
          {event.description && (
            <div style={ROW_STYLE}>
              <FileTextIcon style={ICON_COL} />
              <div>
                <div style={LABEL_STYLE}>상세 설명</div>
                <div style={{ fontSize: 13.5, color: 'var(--charcoal)', lineHeight: 1.6 }}>{event.description}</div>
              </div>
            </div>
          )}

          {/* 담당자 / 동아리 */}
          {(event.contact ?? event.club) && (
            <div style={ROW_STYLE}>
              <UserIcon style={ICON_COL} />
              <div>
                <div style={LABEL_STYLE}>{event.contact ? '담당자' : '동아리'}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-deep)' }}>
                  {event.contact ?? event.club}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button
            type="button"
            onClick={onEdit}
            style={{
              height: 48, borderRadius: 12,
              border: '1px solid var(--gray-line)',
              background: 'var(--paper)',
              color: 'var(--charcoal)',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            수정
          </button>
          <button
            type="button"
            onClick={onDelete}
            style={{
              height: 48, borderRadius: 12,
              border: 'none',
              background: '#C0623E',
              color: '#fff',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
