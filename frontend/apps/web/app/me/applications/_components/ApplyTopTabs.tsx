/* a-apply-status-parts.jsx → TypeScript 변환: ApplyTopTabs */

import { FILTERS, PAGE_MAX, PAGE_PAD } from '../_constants/data';
import type { Counts, FilterKey } from '../_constants/data';

type Props = {
  active: FilterKey[];
  onToggle: (key: FilterKey) => void;
  counts: Counts;
};

export function ApplyTopTabs({ active, onToggle, counts }: Props) {
  return (
    <section style={{ padding: `22px ${PAGE_PAD} 0` }}>
      <div style={{
        maxWidth: PAGE_MAX, margin: '0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map(filterTab => {
            const isActive = active.includes(filterTab.key);
            return (
              <button key={filterTab.key} onClick={() => onToggle(filterTab.key)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px',
                borderRadius: 999,
                border: isActive ? 'none' : '1px solid var(--gray-line)',
                background: isActive ? 'var(--ink-deep)' : 'var(--paper)',
                color: isActive ? '#fff' : 'var(--charcoal-2)',
                fontSize: 12.5, fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all .15s ease',
              }}>
                {filterTab.label}
                <span style={{
                  fontSize: 11.5, fontWeight: 700,
                  color: isActive ? 'rgba(255,255,255,0.85)' : 'var(--charcoal-3)',
                  fontFamily: 'var(--font-mono)',
                }}>{counts[filterTab.key]}</span>
              </button>
            );
          })}
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '6px 12px',
          borderRadius: 8,
          background: 'transparent',
          fontSize: 12.5, fontWeight: 600,
          color: 'var(--charcoal-2)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          최신순
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>
    </section>
  );
}
