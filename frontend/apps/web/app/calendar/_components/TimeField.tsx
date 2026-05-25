'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type TimeFieldProps = {
  popoverTitle: string;
  value: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (next: string) => void;
};

/* ------------------------------------------------------------------ */
/* Internals                                                            */
/* ------------------------------------------------------------------ */

function clampInt(v: number, max: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > max) return max;
  return Math.floor(v);
}

const WHEEL_ITEM_HEIGHT = 28;
const WHEEL_VISIBLE = 5;
const WHEEL_PAD_COUNT = Math.floor(WHEEL_VISIBLE / 2);
const POPOVER_WIDTH = 170;
const POPOVER_MARGIN = 12;

type PopoverPosition = { top: number; left: number; arrowLeft: number };

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
      const instantScroll: ScrollToOptions = { top: target, behavior: 'instant' };
      el.scrollTo(instantScroll);
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
        width: 62,
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
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit',
              fontSize: dist === 0 ? 16 : 13,
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

/* ------------------------------------------------------------------ */
/* Public                                                               */
/* ------------------------------------------------------------------ */

export function TimeField({ popoverTitle, value, open, onOpen, onClose, onChange }: TimeFieldProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const [mounted, setMounted] = useState<boolean>(false);
  const [rawHH, rawMM] = value.split(':');
  const hh = clampInt(Number(rawHH ?? '0'), 23);
  const mm = clampInt(Number(rawMM ?? '0'), 59);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) { setPosition(null); return; }
    const computePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const triggerCenterX = rect.left + rect.width / 2;
      const minLeft = POPOVER_MARGIN;
      const maxLeft = window.innerWidth - POPOVER_WIDTH - POPOVER_MARGIN;
      const idealLeft = triggerCenterX - POPOVER_WIDTH / 2;
      const left = Math.max(minLeft, Math.min(maxLeft, idealLeft));
      const arrowLeft = Math.max(16, Math.min(POPOVER_WIDTH - 16, triggerCenterX - left));
      setPosition({ top: rect.bottom + 8, left, arrowLeft });
    };
    computePosition();
    window.addEventListener('resize', computePosition);
    window.addEventListener('scroll', computePosition, true);
    return () => {
      window.removeEventListener('resize', computePosition);
      window.removeEventListener('scroll', computePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const deferred = window.setTimeout(() => {
      document.addEventListener('mousedown', onDocPointerDown);
    }, 0);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(deferred);
      document.removeEventListener('mousedown', onDocPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const setHour   = (h: number) => onChange(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  const setMinute = (m: number) => onChange(`${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  const hours   = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div style={{ flex: 1, position: 'relative', minWidth: 0, zIndex: open ? 60 : 'auto' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? onClose() : onOpen())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={popoverTitle}
        style={{
          width: '100%', height: 44, padding: '0 12px',
          borderRadius: 10,
          border: `1px solid ${open ? 'var(--sage)' : 'var(--gray-line)'}`,
          background: '#fff', color: 'var(--ink-deep)',
          fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
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

      {open && mounted && position && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={popoverTitle}
          style={{
            position: 'fixed',
            top: position.top, left: position.left,
            zIndex: 300,
            width: POPOVER_WIDTH,
            padding: '12px 16px 14px',
            borderRadius: 16,
            background: '#fff',
            border: '1px solid var(--gray-line)',
            boxShadow: '0 18px 40px rgba(31,74,54,0.18)',
            animation: 'duing-pop-in .18s cubic-bezier(.22,.61,.36,1)',
          }}
        >
          <div aria-hidden="true" style={{
            position: 'absolute',
            top: -6, left: position.arrowLeft, transform: 'translateX(-50%) rotate(45deg)',
            width: 10, height: 10,
            background: '#fff',
            borderLeft: '1px solid var(--gray-line)',
            borderTop: '1px solid var(--gray-line)',
          }} />
          <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--charcoal-2)', marginBottom: 10 }}>
            {popoverTitle}
          </div>
          <div style={{
            position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 6,
            height: WHEEL_VISIBLE * WHEEL_ITEM_HEIGHT,
          }}>
            <div aria-hidden="true" style={{
              position: 'absolute', left: 8, right: 8,
              top: '50%', transform: 'translateY(-50%)',
              height: WHEEL_ITEM_HEIGHT,
              borderRadius: 7,
              background: 'var(--sage-tint)',
              pointerEvents: 'none',
            }} />
            <WheelColumn values={hours}   value={hh} ariaLabel="시" onChange={setHour}   />
            <span style={{ color: 'var(--charcoal-3)', fontWeight: 700, position: 'relative', zIndex: 1 }}>:</span>
            <WheelColumn values={minutes} value={mm} ariaLabel="분" onChange={setMinute} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
