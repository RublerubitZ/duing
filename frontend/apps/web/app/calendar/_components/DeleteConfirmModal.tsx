'use client';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

function WarningIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
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

export function DeleteConfirmModal({ open, onClose, onConfirm }: Props) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 250,
        background: 'rgba(31,32,30,0.45)',
        display: 'grid', placeItems: 'center',
        padding: 16,
        animation: 'duing-del-fade .18s ease',
      }}
    >
      <style>{`
        @keyframes duing-del-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes duing-del-pop {
          from { opacity: 0; transform: translateY(8px) scale(.97) }
          to   { opacity: 1; transform: translateY(0) scale(1) }
        }
      `}</style>
      <div
        className="duing"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        aria-describedby="delete-confirm-desc"
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'var(--cream)',
          borderRadius: 24,
          border: '1px solid var(--gray-line)',
          boxShadow: '0 24px 60px rgba(31,74,54,0.20)',
          padding: '28px 28px 24px',
          position: 'relative',
          animation: 'duing-del-pop .22s cubic-bezier(.22,.61,.36,1)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 32, height: 32, borderRadius: 999,
            border: 'none', background: 'transparent',
            color: 'var(--charcoal-2)',
            display: 'grid', placeItems: 'center', cursor: 'pointer',
          }}
        >
          <CloseIcon style={{ width: 18, height: 18 }} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{
            display: 'inline-grid', placeItems: 'center',
            width: 56, height: 56, borderRadius: 999,
            background: '#FCE2D9',
          }}>
            <WarningIcon style={{ width: 26, height: 26, color: '#C0623E' }} />
          </div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <h2 id="delete-confirm-title" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-deep)', marginBottom: 8 }}>
            일정을 삭제하시겠습니까?
          </h2>
          <p id="delete-confirm-desc" style={{ fontSize: 13.5, color: 'var(--charcoal-3)', lineHeight: 1.55 }}>
            삭제된 일정은 복구할 수 없습니다.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 48, borderRadius: 12,
              border: '1px solid var(--gray-line)',
              background: 'var(--paper)',
              color: 'var(--charcoal)',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
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
