/* a-apply-status-parts.jsx → TypeScript 변환: ApplySummaryCard */

import { SparkleFull } from './Shared';
import type { Counts } from '../_constants/data';

type Props = {
  counts: Counts;
};

export function ApplySummaryCard({ counts }: Props) {
  const progress = (counts.doc ?? 0) + (counts.intv ?? 0) + (counts.final ?? 0);
  const done = (counts.pass ?? 0) + (counts.fail ?? 0);
  const cancel = counts.cancel ?? 0;
  const total = counts.all ?? 0;
  return (
    <div style={{
      background: 'linear-gradient(160deg, #1F4A36 0%, #143025 100%)',
      color: '#fff',
      borderRadius: 16,
      padding: '18px 20px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <SparkleFull size={28} color="rgba(157,182,160,0.30)" style={{ position: 'absolute', top: 12, right: 12 }} />
      <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.92)', marginBottom: 6 }}>
        나의 지원 요약
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 12 }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: 42, fontWeight: 700, color: '#fff',
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}>{total}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>건</span>
        <SparkleFull size={14} color="#C9D8CC" style={{ marginLeft: 4, transform: 'translateY(-16px)' }} />
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        gap: 0,
        paddingTop: 10,
      }}>
        {[
          { label: '진행 중', value: progress },
          { label: '완료',   value: done },
          { label: '취소',   value: cancel },
        ].map((summaryItem, i) => (
          <div key={i} style={{
            textAlign: 'center',
            borderLeft: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.10)',
          }}>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.62)', marginBottom: 2 }}>
              {summaryItem.label}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: '#fff' }}>
              {summaryItem.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
