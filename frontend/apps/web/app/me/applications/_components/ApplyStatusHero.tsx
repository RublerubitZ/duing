/* a-apply-status-parts.jsx → TypeScript 변환: ApplyStatusHero */

import { PAGE_MAX, PAGE_PAD } from '../_constants/data';
import { SparkleFull } from './Shared';

export const ApplyStatusHero = () => (
  <section style={{ padding: `26px ${PAGE_PAD} 0` }}>
    <div style={{ maxWidth: PAGE_MAX, margin: '0 auto' }}>
      <div style={{
        fontSize: 11.5, fontWeight: 600,
        color: 'var(--charcoal-3)',
        marginBottom: 14,
        letterSpacing: '0.02em',
      }}>
        MY · 지원현황
      </div>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24,
      }}>
        <div>
          <h1 style={{
            fontSize: 32, fontWeight: 700,
            color: 'var(--ink-deep)',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            margin: 0,
            whiteSpace: 'nowrap',
          }}>
            지원현황
            <SparkleFull size={20} color="#9DB6A0" style={{ display: 'inline-block', transform: 'translateY(2px)' }} />
          </h1>
          <p style={{
            fontSize: 13, color: 'var(--charcoal-2)',
            marginTop: 8,
          }}>
            내가 신청한 동아리 현황을 한눈에 확인하고, 각 단계별 결과를 확인할 수 있어요.
          </p>
        </div>
      </div>
    </div>
  </section>
);
