'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { SparkleFull } from '../../_components/Sparkle';

export type NewEventCategory =
  | 'meet'
  | 'deadline'
  | 'show'
  | 'volunteer'
  | 'notice'
  | 'etc';

export type NewEventRepeat = {
  freq: 'none' | 'weekly' | 'monthly';
  count: number;
};

export type NewEventInput = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  place: string;
  category: NewEventCategory;
  memo: string;
  repeat: NewEventRepeat;
};

type Props = {
  open: boolean;
  defaultDate?: string;
  onClose: () => void;
  onSubmit: (event: NewEventInput) => void;
};

type CategoryStyle = {
  label: string;
  dot: string;
  bg: string;
  fg: string;
};

const CATEGORY_STYLES: Record<NewEventCategory, CategoryStyle> = {
  meet:      { label: '정기모임',  dot: 'var(--sage)', bg: 'var(--sage-tint)', fg: 'var(--ink-deep)' },
  deadline:  { label: '모집마감',  dot: '#D97757',     bg: '#FCE2D9',          fg: '#9A3F23'         },
  show:      { label: '공연·전시', dot: '#B65672',     bg: '#F6DCE3',          fg: '#7E2A45'         },
  volunteer: { label: '봉사',      dot: '#6A95B8',     bg: '#DDE8F1',          fg: '#2F557A'         },
  notice:    { label: '공지',      dot: 'var(--ink)',  bg: 'var(--sage-mist)', fg: 'var(--ink-deep)' },
  etc:       { label: '기타',      dot: '#9CA3AF',     bg: '#EFEEE9',          fg: 'var(--charcoal)' },
};

const CATEGORY_ORDER: NewEventCategory[] = ['meet', 'deadline', 'show', 'volunteer', 'notice', 'etc'];

const MEMO_LIMIT = 200;

const toKoreanDateLabel = (iso: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dow = new Date(y, m - 1, d).getDay();
  const dowKR = (['일', '월', '화', '수', '목', '금', '토'][dow]) ?? '';
  return `${y}. ${String(m).padStart(2, '0')}. ${String(d).padStart(2, '0')} (${dowKR})`;
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
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
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

function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

type TimeInputProps = {
  value: string;
  onChange: (next: string) => void;
};

function clampInt(v: number, max: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > max) return max;
  return Math.floor(v);
}

const WHEEL_ITEM_HEIGHT = 32;
const WHEEL_VISIBLE = 5;
const WHEEL_PAD_COUNT = Math.floor(WHEEL_VISIBLE / 2);

type WheelColumnProps = {
  values: number[];
  value: number;
  ariaLabel: string;
  onChange: (next: number) => void;
};

function WheelColumn({ values, value, ariaLabel, onChange }: WheelColumnProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const lockRef = useRef<boolean>(false);
  const snapTimerRef = useRef<number | null>(null);
  const lockTimerRef = useRef<number | null>(null);
  const [activeIdx, setActiveIdx] = useState<number>(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = value * WHEEL_ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - target) > 1) {
      lockRef.current = true;
      if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
      // jump instantly so smooth scroll doesn't fire intermediate onChange
      el.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior });
      lockTimerRef.current = window.setTimeout(() => { lockRef.current = false; }, 80);
    }
    setActiveIdx(value);
  }, [value]);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / WHEEL_ITEM_HEIGHT)));
    setActiveIdx(idx);

    if (lockRef.current) return;
    if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    snapTimerRef.current = window.setTimeout(() => {
      const el2 = ref.current;
      if (!el2) return;
      const finalIdx = Math.max(0, Math.min(values.length - 1, Math.round(el2.scrollTop / WHEEL_ITEM_HEIGHT)));
      if (finalIdx !== value) onChange(finalIdx);
    }, 140);
  };

  const goTo = (idx: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: idx * WHEEL_ITEM_HEIGHT, behavior: 'smooth' });
  };

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp')   { e.preventDefault(); goTo(Math.max(0, value - 1)); }
        if (e.key === 'ArrowDown') { e.preventDefault(); goTo(Math.min(values.length - 1, value + 1)); }
      }}
      className="duing-wheel-col"
      style={{
        width: 44,
        height: WHEEL_VISIBLE * WHEEL_ITEM_HEIGHT,
        overflowY: 'scroll',
        scrollSnapType: 'y mandatory',
        overscrollBehavior: 'contain',
        outline: 'none',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 28%, #000 72%, transparent 100%)',
        maskImage: 'linear-gradient(to bottom, transparent 0, #000 28%, #000 72%, transparent 100%)',
      }}
    >
      <div style={{ height: WHEEL_PAD_COUNT * WHEEL_ITEM_HEIGHT }} aria-hidden="true" />
      {values.map((v, i) => {
        const dist = Math.abs(i - activeIdx);
        const opacity = dist === 0 ? 1 : dist === 1 ? 0.55 : dist === 2 ? 0.28 : 0.15;
        const scale = dist === 0 ? 1 : 0.92;
        return (
          <div
            key={v}
            role="option"
            aria-selected={dist === 0}
            onClick={() => goTo(i)}
            style={{
              height: WHEEL_ITEM_HEIGHT,
              scrollSnapAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'inherit',
              fontSize: dist === 0 ? 18 : 15,
              fontWeight: dist === 0 ? 700 : 500,
              color: dist === 0 ? 'var(--ink-deep)' : 'var(--charcoal-2)',
              opacity,
              transform: `scale(${scale})`,
              transition: 'opacity .18s ease, transform .18s ease, font-size .18s ease',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {String(v).padStart(2, '0')}
          </div>
        );
      })}
      <div style={{ height: WHEEL_PAD_COUNT * WHEEL_ITEM_HEIGHT }} aria-hidden="true" />
    </div>
  );
}

function ChevronDown(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

type TimeFieldProps = {
  label: string;
  popoverTitle: string;
  value: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (next: string) => void;
};

function TimeField({ label, popoverTitle, value, open, onOpen, onClose, onChange }: TimeFieldProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [rawHH, rawMM] = value.split(':');
  const hh = clampInt(Number(rawHH ?? '0'), 23);
  const mm = clampInt(Number(rawMM ?? '0'), 59);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // defer so the opening click itself doesn't immediately close
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onDocClick);
    }, 0);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const setHour = (h: number) => {
    onChange(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  };
  const setMinute = (m: number) => {
    onChange(`${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div
      ref={wrapRef}
      style={{
        flex: 1,
        position: 'relative',
        minWidth: 0,
        zIndex: open ? 60 : 'auto',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--charcoal-3)', fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>
      <button
        type="button"
        onClick={() => (open ? onClose() : onOpen())}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          width: '100%',
          height: 44,
          padding: '0 12px',
          borderRadius: 10,
          border: `1px solid ${open ? 'var(--sage)' : 'var(--gray-line)'}`,
          background: 'var(--paper)',
          color: 'var(--ink-deep)',
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          boxShadow: open ? '0 0 0 3px rgba(157,182,160,0.18)' : 'none',
          transition: 'border-color .12s ease, box-shadow .12s ease',
        }}
      >
        <span>{value}</span>
        <ChevronDown style={{
          width: 14, height: 14, color: 'var(--charcoal-3)',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform .18s ease',
        }} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={popoverTitle}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            width: 220,
            padding: '14px 16px 16px',
            borderRadius: 16,
            background: 'var(--paper)',
            border: '1px solid var(--gray-line)',
            boxShadow: '0 18px 40px rgba(31,74,54,0.18)',
            animation: 'duing-pop-in .18s cubic-bezier(.22,.61,.36,1)',
          }}
        >
          {/* Arrow */}
          <div aria-hidden="true" style={{
            position: 'absolute',
            top: -6, left: '50%', transform: 'translateX(-50%) rotate(45deg)',
            width: 12, height: 12,
            background: 'var(--paper)',
            borderLeft: '1px solid var(--gray-line)',
            borderTop: '1px solid var(--gray-line)',
          }} />
          <div style={{
            textAlign: 'center', fontSize: 12, fontWeight: 700,
            color: 'var(--charcoal-2)', marginBottom: 10,
          }}>
            {popoverTitle}
          </div>
          <div style={{
            position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 4,
            height: WHEEL_VISIBLE * WHEEL_ITEM_HEIGHT,
          }}>
            <div aria-hidden="true" style={{
              position: 'absolute',
              left: 8, right: 8,
              top: '50%', transform: 'translateY(-50%)',
              height: WHEEL_ITEM_HEIGHT,
              borderRadius: 8,
              background: 'var(--sage-tint)',
              pointerEvents: 'none',
            }} />
            <WheelColumn values={hours}   value={hh} ariaLabel="시" onChange={setHour}   />
            <span style={{ color: 'var(--charcoal-3)', fontWeight: 700, position: 'relative', zIndex: 1 }}>:</span>
            <WheelColumn values={minutes} value={mm} ariaLabel="분" onChange={setMinute} />
          </div>
        </div>
      )}
    </div>
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

export function AddEventModal({ open, defaultDate, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState<string>('');
  const [date, setDate] = useState<string>(defaultDate ?? '');
  const [startTime, setStartTime] = useState<string>('12:00');
  const [endTime, setEndTime] = useState<string>('13:00');
  const [place, setPlace] = useState<string>('');
  const [category, setCategory] = useState<NewEventCategory>('meet');
  const [memo, setMemo] = useState<string>('');
  const [repeatOpen, setRepeatOpen] = useState<boolean>(false);
  const [repeatFreq, setRepeatFreq] = useState<NewEventRepeat['freq']>('none');
  const [repeatCount, setRepeatCount] = useState<number>(1);
  const [touched, setTouched] = useState<boolean>(false);
  const [openPicker, setOpenPicker] = useState<'start' | 'end' | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    const maybeShow = (el as HTMLInputElement & { showPicker?: () => void }).showPicker;
    if (typeof maybeShow === 'function') {
      try { maybeShow.call(el); return; } catch { /* fall through to focus */ }
    }
    el.focus();
  };

  useEffect(() => {
    if (open) {
      setTitle('');
      setDate(defaultDate ?? '');
      setStartTime('12:00');
      setEndTime('13:00');
      setPlace('');
      setCategory('meet');
      setMemo('');
      setRepeatOpen(false);
      setRepeatFreq('none');
      setRepeatCount(1);
      setTouched(false);
      setOpenPicker(null);
    }
  }, [open, defaultDate]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const dateLabel = useMemo(() => toKoreanDateLabel(date), [date]);
  const isValid = title.trim().length > 0 && date.length > 0;

  if (!open) return null;

  const handleSubmit = () => {
    setTouched(true);
    if (!isValid) return;
    onSubmit({
      title: title.trim(),
      date,
      startTime,
      endTime,
      place: place.trim(),
      category,
      memo: memo.trim(),
      repeat: { freq: repeatFreq, count: repeatFreq === 'none' ? 1 : repeatCount },
    });
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--ink-deep)',
    marginBottom: 8,
    display: 'block',
  };

  const inputBase: React.CSSProperties = {
    width: '100%',
    height: 44,
    padding: '0 14px',
    borderRadius: 10,
    border: '1px solid var(--gray-line)',
    background: 'var(--paper)',
    fontFamily: 'inherit',
    fontSize: 14,
    color: 'var(--ink-deep)',
    outline: 'none',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(31, 32, 30, 0.42)',
        display: 'grid', placeItems: 'center',
        padding: 16,
        animation: 'duing-fade-in .18s ease',
      }}
    >
      <style>{`
        @keyframes duing-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes duing-pop-in {
          from { opacity: 0; transform: translateY(8px) scale(.98) }
          to   { opacity: 1; transform: translateY(0) scale(1) }
        }
        .duing-modal input:focus,
        .duing-modal textarea:focus {
          border-color: var(--sage) !important;
          box-shadow: 0 0 0 3px rgba(157,182,160,0.18);
        }
        .duing-modal input[type="date"]::-webkit-calendar-picker-indicator {
          display: none;
          -webkit-appearance: none;
        }
        .duing-modal input[type="date"]::-webkit-inner-spin-button,
        .duing-modal input[type="date"]::-webkit-clear-button {
          display: none;
        }
        .duing-wheel-col {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .duing-wheel-col::-webkit-scrollbar {
          display: none;
        }
        .duing-wheel-col:focus-visible {
          box-shadow: inset 0 0 0 2px rgba(157,182,160,0.45);
          border-radius: 8px;
        }
      `}</style>

      <div
        className="duing duing-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-event-modal-title"
        style={{
          width: '100%',
          maxWidth: 460,
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
          background: 'var(--cream)',
          borderRadius: 24,
          border: '1px solid var(--gray-line)',
          boxShadow: '0 24px 60px rgba(31, 74, 54, 0.18)',
          padding: '24px 28px 24px',
          position: 'relative',
          animation: 'duing-pop-in .22s cubic-bezier(.22,.61,.36,1)',
        }}
      >
        {/* Localized dim overlay — active time field stays above this */}
        {openPicker !== null && (
          <div
            onMouseDown={() => setOpenPicker(null)}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 24,
              background: 'rgba(31, 32, 30, 0.32)',
              zIndex: 40,
              animation: 'duing-fade-in .18s ease',
            }}
          />
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 id="add-event-modal-title" style={{ fontSize: 22, lineHeight: 1.1, display: 'flex', alignItems: 'center', gap: 8 }}>
            새 일정 추가
            <SparkleFull size={18} color="var(--sage)" style={{ display: 'inline-block', verticalAlign: 'middle' }} />
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              width: 32, height: 32, borderRadius: 999,
              border: 'none', background: 'transparent',
              color: 'var(--charcoal-2)',
              display: 'grid', placeItems: 'center', cursor: 'pointer',
            }}
          >
            <CloseIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* 일정명 */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>
            일정명 <span style={{ color: '#D97757' }}>*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="일정 제목을 입력하세요"
            style={{
              ...inputBase,
              borderColor: touched && !title.trim() ? '#D97757' : 'var(--gray-line)',
            }}
          />
        </div>

        {/* 날짜 / 시간 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>
              날짜 <span style={{ color: '#D97757' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={openDatePicker}
                aria-label="날짜 선택 열기"
                style={{
                  position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                  width: 28, height: 28, padding: 0,
                  border: 'none', background: 'transparent',
                  display: 'grid', placeItems: 'center',
                  color: 'var(--charcoal-3)', cursor: 'pointer',
                }}
              >
                <CalendarIcon style={{ width: 16, height: 16 }} />
              </button>
              <input
                ref={dateInputRef}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                lang="en-GB"
                style={{
                  ...inputBase,
                  padding: '0 14px 0 38px',
                  borderColor: touched && !date ? '#D97757' : 'var(--gray-line)',
                }}
              />
              {date && (
                <span style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 11, color: 'var(--charcoal-3)', pointerEvents: 'none', fontWeight: 600,
                }}>
                  {dateLabel.slice(-3)}
                </span>
              )}
            </div>
          </div>
          <div>
            <label style={labelStyle}>시간</label>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <TimeField
                label="시작 시간"
                popoverTitle="시작 시간 선택"
                value={startTime}
                open={openPicker === 'start'}
                onOpen={() => setOpenPicker('start')}
                onClose={() => setOpenPicker((p) => (p === 'start' ? null : p))}
                onChange={setStartTime}
              />
              <span style={{ color: 'var(--charcoal-3)', fontWeight: 600, paddingBottom: 12 }}>~</span>
              <TimeField
                label="종료 시간"
                popoverTitle="종료 시간 선택"
                value={endTime}
                open={openPicker === 'end'}
                onOpen={() => setOpenPicker('end')}
                onClose={() => setOpenPicker((p) => (p === 'end' ? null : p))}
                onChange={setEndTime}
              />
              <ClockIcon style={{ width: 16, height: 16, color: 'var(--charcoal-3)', flexShrink: 0, marginBottom: 14 }} />
            </div>
          </div>
        </div>

        {/* 장소 */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>장소</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="장소를 입력하세요"
              style={{ ...inputBase, paddingRight: 40 }}
            />
            <PinIcon style={{
              position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
              width: 16, height: 16, color: 'var(--charcoal-3)', pointerEvents: 'none',
            }} />
          </div>
        </div>

        {/* 카테고리 */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>카테고리</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORY_ORDER.map((c) => {
              const s = CATEGORY_STYLES[c];
              const active = category === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 999,
                    border: `1px solid ${active ? s.dot : 'var(--gray-line)'}`,
                    background: active ? s.bg : 'var(--paper)',
                    color: active ? s.fg : 'var(--charcoal-2)',
                    fontFamily: 'inherit',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background .12s ease, border-color .12s ease',
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 메모 */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>메모</label>
          <div style={{ position: 'relative' }}>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value.slice(0, MEMO_LIMIT))}
              placeholder="메모를 입력하세요 (선택사항)"
              rows={4}
              style={{
                ...inputBase,
                height: 'auto',
                padding: '12px 14px',
                resize: 'none',
                lineHeight: 1.5,
              }}
            />
            <span style={{
              position: 'absolute', right: 12, bottom: 10,
              fontSize: 11, color: 'var(--charcoal-3)',
              fontFamily: 'var(--font-mono)',
            }}>
              {memo.length} / {MEMO_LIMIT}
            </span>
          </div>
        </div>

        {/* 반복 일정 설정 */}
        <div style={{ marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => setRepeatOpen((v) => !v)}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px dashed var(--gray-line)',
              background: 'transparent',
              color: 'var(--charcoal-2)',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <PlusIcon style={{ width: 14, height: 14 }} />
            반복 일정 설정 (선택)
          </button>
          {repeatOpen && (
            <div style={{
              marginTop: 10,
              padding: 14,
              borderRadius: 12,
              border: '1px solid var(--gray-line)',
              background: 'var(--paper)',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['none', 'weekly', 'monthly'] as const).map((f) => {
                  const labelText = f === 'none' ? '반복 안 함' : f === 'weekly' ? '매주' : '매월';
                  const active = repeatFreq === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setRepeatFreq(f)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 999,
                        border: `1px solid ${active ? 'var(--sage)' : 'var(--gray-line)'}`,
                        background: active ? 'var(--sage-tint)' : 'var(--paper)',
                        color: active ? 'var(--ink-deep)' : 'var(--charcoal-2)',
                        fontFamily: 'inherit',
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {labelText}
                    </button>
                  );
                })}
              </div>
              {repeatFreq !== 'none' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--charcoal-2)', fontWeight: 600 }}>총 횟수</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={repeatCount}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setRepeatCount(Number.isFinite(v) ? Math.min(12, Math.max(1, v)) : 1);
                    }}
                    style={{ ...inputBase, height: 36, width: 80, fontFamily: 'var(--font-mono)' }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--charcoal-3)' }}>회 (최대 12회)</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 48,
              borderRadius: 12,
              border: '1px solid var(--gray-line)',
              background: 'var(--paper)',
              color: 'var(--charcoal)',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid}
            style={{
              height: 48,
              borderRadius: 12,
              border: 'none',
              background: isValid ? 'var(--ink)' : 'rgba(31,32,30,0.4)',
              color: '#fff',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 700,
              cursor: isValid ? 'pointer' : 'not-allowed',
              transition: 'background .12s ease',
            }}
          >
            일정 추가
          </button>
        </div>
      </div>
    </div>
  );
}
