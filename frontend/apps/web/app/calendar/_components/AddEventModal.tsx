'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { SparkleFull } from '../../_components/Sparkle';

import { TimeField } from './TimeField';

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

const REPEAT_FREQ_OPTIONS: NewEventRepeat['freq'][] = ['none', 'weekly', 'monthly'];

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
    const showPickerFn = Reflect.get(el, 'showPicker');
    if (typeof showPickerFn === 'function') {
      try { showPickerFn.call(el); return; } catch { /* fall through to focus */ }
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TimeField
                popoverTitle="시작 시간 선택"
                value={startTime}
                open={openPicker === 'start'}
                onOpen={() => setOpenPicker('start')}
                onClose={() => setOpenPicker((p) => (p === 'start' ? null : p))}
                onChange={setStartTime}
              />
              <span style={{ color: 'var(--charcoal-3)', fontWeight: 600 }}>~</span>
              <TimeField
                popoverTitle="종료 시간 선택"
                value={endTime}
                open={openPicker === 'end'}
                onOpen={() => setOpenPicker('end')}
                onClose={() => setOpenPicker((p) => (p === 'end' ? null : p))}
                onChange={setEndTime}
              />
              <ClockIcon style={{ width: 16, height: 16, color: 'var(--charcoal-3)', flexShrink: 0 }} />
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
                {REPEAT_FREQ_OPTIONS.map((f) => {
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
