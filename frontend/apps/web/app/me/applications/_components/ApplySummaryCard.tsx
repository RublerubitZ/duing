/* a-apply-status-parts.jsx → TypeScript 변환: ApplySummaryCard */

import { APPLICATION_CLOSED_WITHOUT_RESULT_SHORT_LABEL } from '@/app/_constants/application-status';

import { SparkleFull } from './Shared';
import type { Counts } from '../_constants/data';

type Props = {
  counts: Counts;
};

export function ApplySummaryCard({ counts }: Props) {
  const progress = (counts.doc ?? 0) + (counts.intv ?? 0);
  const done = (counts.pass ?? 0) + (counts.fail ?? 0);
  // 모집이 끝났는데 결과가 없는 지원 — 진행 중도 완료도 아니라 별도 칸으로 센다.
  const closedWithoutResult = counts.closed ?? 0;
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
          { label: APPLICATION_CLOSED_WITHOUT_RESULT_SHORT_LABEL, value: closedWithoutResult },
        ].map((summaryItem, i) => (
          <div key={i} style={{
            textAlign: 'center',
            borderLeft: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.10)',
          }}>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.62)', marginBottom: 2 }}>
              {summaryItem.label}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
              {summaryItem.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
