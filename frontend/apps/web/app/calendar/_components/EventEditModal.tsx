'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { TimeField } from './TimeField';

import type { AccentKey, CalEvent, EventKind } from '../_types';

type Props = {
  event: CalEvent;
  open: boolean;
  onClose: () => void;
  onSave: (updated: CalEvent) => void;
};

type KindStyle = { label: string; dot: string; bg: string; fg: string };

const KIND_STYLES: Record<EventKind, KindStyle> = {
  meet:      { label: '정기모임',  dot: 'var(--sage)', bg: 'var(--sage-tint)', fg: 'var(--ink-deep)' },
  deadline:  { label: '모집마감',  dot: '#D97757',     bg: '#FCE2D9',          fg: '#9A3F23'         },
  fair:      { label: '박람회',    dot: '#E8B968',     bg: '#FBEFD7',          fg: '#8E6620'         },
  show:      { label: '공연·전시', dot: '#B65672',     bg: '#F6DCE3',          fg: '#7E2A45'         },
  volunteer: { label: '봉사',      dot: '#6A95B8',     bg: '#DDE8F1',          fg: '#2F557A'         },
  notice:    { label: '공지',      dot: 'var(--ink)',  bg: 'var(--sage-mist)', fg: 'var(--ink-deep)' },
};

const KIND_TO_ACCENT: Record<EventKind, AccentKey> = {
  meet: 'sage', deadline: 'coral', fair: 'warm', show: 'berry', volunteer: 'sky', notice: 'ink',
};

const KIND_ORDER: EventKind[] = ['meet', 'deadline', 'fair', 'show', 'volunteer', 'notice'];

const parseEventTime = (time: string): { startTime: string; endTime: string } => {
  if (!time) return { startTime: '', endTime: '' };
  const parts = time.split('–');
  return { startTime: parts[0]?.trim() ?? '', endTime: parts[1]?.trim() ?? '' };
};

const buildTimeLabel = (startTime: string, endTime: string): string => {
  if (!startTime) return '';
  if (endTime && endTime !== startTime) return `${startTime}–${endTime}`;
  return startTime;
};

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

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

const MEMO_LIMIT = 300;

export function EventEditModal({ event, open, onClose, onSave }: Props) {
  const [title, setTitle] = useState<string>(event.title);
  const [date, setDate] = useState<string>(event.date);
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [place, setPlace] = useState<string>(event.place);
  const [kind, setKind] = useState<EventKind>(event.kind);
  const [description, setDescription] = useState<string>(event.description ?? '');
  const [touched, setTouched] = useState<boolean>(false);
  const [openPicker, setOpenPicker] = useState<'start' | 'end' | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      const parsed = parseEventTime(event.time);
      setTitle(event.title);
      setDate(event.date);
      setStartTime(parsed.startTime);
      setEndTime(parsed.endTime);
      setPlace(event.place);
      setKind(event.kind);
      setDescription(event.description ?? '');
      setTouched(false);
      setOpenPicker(null);
    }
  }, [open, event]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    const showPickerFn = Reflect.get(el, 'showPicker');
    if (typeof showPickerFn === 'function') {
      try { showPickerFn.call(el); return; } catch { /* fall through */ }
    }
    el.focus();
  };

  const isValid = title.trim().length > 0 && date.length > 0;
  const isTimeValid = useMemo(() => {
    if (!startTime || !endTime) return true;
    return endTime >= startTime;
  }, [startTime, endTime]);

  const handleSave = () => {
    setTouched(true);
    if (!isValid || !isTimeValid) return;
    onSave({
      ...event,
      title: title.trim(),
      date,
      time: buildTimeLabel(startTime, endTime),
      place: place.trim() || '장소 미정',
      kind,
      accent: KIND_TO_ACCENT[kind],
      description: description.trim() || undefined,
    });
  };

  if (!open) return null;

  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 700, color: 'var(--ink-deep)', marginBottom: 8, display: 'block',
  };

  const inputBase: React.CSSProperties = {
    width: '100%', height: 44, padding: '0 14px',
    borderRadius: 10, border: '1px solid var(--gray-line)',
    background: 'var(--paper)', fontFamily: 'inherit',
    fontSize: 14, color: 'var(--ink-deep)', outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(31,32,30,0.42)',
        display: 'grid', placeItems: 'center',
        padding: 16,
        animation: 'duing-edit-fade .18s ease',
      }}
    >
      <style>{`
        @keyframes duing-edit-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes duing-edit-pop {
          from { opacity: 0; transform: translateY(8px) scale(.97) }
          to   { opacity: 1; transform: translateY(0) scale(1) }
        }
        .duing-edit-modal input:focus,
        .duing-edit-modal textarea:focus {
          border-color: var(--sage) !important;
          box-shadow: 0 0 0 3px rgba(157,182,160,0.18);
        }
        .duing-edit-modal input[type="date"]::-webkit-calendar-picker-indicator {
          display: none; -webkit-appearance: none;
        }
        @keyframes duing-pop-in {
          from { opacity: 0; transform: translateY(8px) scale(.98) }
          to   { opacity: 1; transform: translateY(0) scale(1) }
        }
        .duing-wheel-col { scrollbar-width: none; -ms-overflow-style: none; }
        .duing-wheel-col::-webkit-scrollbar { display: none; }
        .duing-wheel-col:focus-visible { box-shadow: inset 0 0 0 2px rgba(157,182,160,0.45); border-radius: 8px; }
      `}</style>
      <div
        className="duing duing-edit-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-edit-title"
        style={{
          width: '100%',
          maxWidth: 460,
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
          background: 'var(--cream)',
          borderRadius: 24,
          border: '1px solid var(--gray-line)',
          boxShadow: '0 24px 60px rgba(31,74,54,0.18)',
          padding: '24px 28px 24px',
          position: 'relative',
          animation: 'duing-edit-pop .22s cubic-bezier(.22,.61,.36,1)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 id="event-edit-title" style={{ fontSize: 20, lineHeight: 1.1, fontWeight: 700, color: 'var(--ink-deep)' }}>
            일정 수정
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
            style={{ ...inputBase, borderColor: touched && !title.trim() ? '#D97757' : 'var(--gray-line)' }}
          />
        </div>

        {/* localized dim — 시간 피커 열릴 때 */}
        {openPicker !== null && (
          <div
            onMouseDown={() => setOpenPicker(null)}
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0, borderRadius: 24,
              background: 'rgba(31,32,30,0.28)', zIndex: 40,
              animation: 'duing-edit-fade .18s ease',
            }}
          />
        )}

        {/* 날짜 / 시간 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          {/* 날짜 */}
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
                style={{ ...inputBase, padding: '0 14px 0 38px', borderColor: touched && !date ? '#D97757' : 'var(--gray-line)' }}
              />
            </div>
          </div>

          {/* 시간 */}
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
            </div>
            {touched && !isTimeValid && (
              <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#D97757', lineHeight: 1.4 }}>
                시간 설정이 잘못되었습니다. 종료 시간을 확인해 주세요
              </p>
            )}
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
            {KIND_ORDER.map((k) => {
              const s = KIND_STYLES[k];
              const active = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  style={{
                    padding: '7px 14px', borderRadius: 999,
                    border: `1px solid ${active ? s.dot : 'var(--gray-line)'}`,
                    background: active ? s.bg : 'var(--paper)',
                    color: active ? s.fg : 'var(--charcoal-2)',
                    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                    transition: 'background .12s ease, border-color .12s ease',
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 상세 설명 */}
        <div style={{ marginBottom: 22 }}>
          <label style={labelStyle}>상세 설명</label>
          <div style={{ position: 'relative' }}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, MEMO_LIMIT))}
              placeholder="상세 설명을 입력하세요 (선택사항)"
              rows={4}
              style={{
                width: '100%', padding: '12px 14px',
                borderRadius: 10, border: '1px solid var(--gray-line)',
                background: 'var(--paper)', fontFamily: 'inherit',
                fontSize: 14, color: 'var(--ink-deep)', outline: 'none',
                resize: 'none', lineHeight: 1.5, boxSizing: 'border-box',
              }}
            />
            <span style={{
              position: 'absolute', right: 12, bottom: 10,
              fontSize: 11, color: 'var(--charcoal-3)', fontFamily: 'var(--font-mono)',
            }}>
              {description.length} / {MEMO_LIMIT}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 48, borderRadius: 12,
              border: '1px solid var(--gray-line)',
              background: 'var(--paper)', color: 'var(--charcoal)',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              height: 48, borderRadius: 12, border: 'none',
              background: isValid ? 'var(--ink)' : 'rgba(31,32,30,0.4)',
              color: '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
              cursor: isValid ? 'pointer' : 'not-allowed',
              transition: 'background .12s ease',
            }}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
