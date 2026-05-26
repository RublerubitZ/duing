/* a-apply-status-parts.jsx → TypeScript 변환: StageFilterCard */

import { FILTERS } from '../_constants/data';
import type { Counts, FilterKey } from '../_constants/data';

type Props = {
  checked: FilterKey[];
  onToggle: (key: FilterKey) => void;
  counts: Counts;
};

export function StageFilterCard({ checked, onToggle, counts }: Props) {
  return (
    <div style={{
      background: 'var(--paper)',
      border: '1px solid var(--gray-line)',
      borderRadius: 14,
      padding: '14px 16px',
    }}>
      <div style={{
        fontSize: 12.5, fontWeight: 700, color: 'var(--ink-deep)',
        marginBottom: 8,
      }}>
        단계별 필터
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {FILTERS.map(filterItem => {
          const isChecked = checked.includes(filterItem.key);
          return (
            <label key={filterItem.key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 2px',
              cursor: 'pointer',
              fontSize: 12.5, color: 'var(--charcoal-2)',
              whiteSpace: 'nowrap',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span
                  onClick={(e) => { e.preventDefault(); onToggle(filterItem.key); }}
                  style={{
                    width: 15, height: 15, borderRadius: 4,
                    background: isChecked ? 'var(--ink-deep)' : 'var(--paper)',
                    border: isChecked ? '1.5px solid var(--ink-deep)' : '1.5px solid var(--gray-line)',
                    display: 'grid', placeItems: 'center',
                    flexShrink: 0,
                    transition: 'all .15s',
                  }}>
                  {isChecked && (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12 L10 17 L19 7" />
                    </svg>
                  )}
                </span>
                <span style={{ fontWeight: isChecked ? 700 : 500, color: isChecked ? 'var(--ink-deep)' : 'var(--charcoal-2)' }}>
                  {filterItem.label}
                </span>
              </span>
              <span style={{
                fontSize: 11.5, fontWeight: 600,
                color: 'var(--charcoal-3)',
                fontFamily: 'var(--font-mono)',
              }}>{counts[filterItem.key]}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
