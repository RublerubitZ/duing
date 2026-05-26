/* a-apply-status-parts.jsx → TypeScript 변환: ApplyStatusNav
   [변경 사유] className="btn ghost sm" → className="btn btn-ghost btn-sm"
   globals.css 의 실제 CSS 클래스명과 일치시켜 렌더링 결과를 동일하게 유지 */

import { PAGE_MAX, PAGE_PAD } from '../_constants/data';
import { BrandMark, Icon } from './Shared';

export function ApplyStatusNav() {
  return (
    <header style={{
      background: 'var(--cream)',
      borderBottom: '1px solid var(--gray-line)',
    }}>
      <div style={{
        maxWidth: PAGE_MAX, margin: '0 auto',
        padding: `14px ${PAGE_PAD}`,
        display: 'flex', alignItems: 'center', gap: 32,
      }}>
        <BrandMark size={22} />
        <nav style={{ display: 'flex', gap: 22, marginLeft: 4 }}>
          {[
            { k: '탐색',   n: '동아리 탐색' },
            { k: '캘린더', n: '캠퍼스 캘린더' },
            { k: '소식',   n: '캠퍼스 소식' },
            { k: '지원',   n: '지원현황' },
          ].map((navItem) => (
            <a key={navItem.k} href="#" style={{
              fontSize: 13.5, fontWeight: 600,
              color: navItem.k === '지원' ? 'var(--ink-deep)' : 'var(--charcoal-3)',
              position: 'relative', paddingBottom: 5,
              whiteSpace: 'nowrap',
            }}>
              {navItem.n}
              {navItem.k === '지원' && (
                <span style={{
                  position: 'absolute', left: 0, right: 0, bottom: -2,
                  height: 2.5, background: 'var(--ink-deep)', borderRadius: 2,
                }}/>
              )}
            </a>
          ))}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" style={{ borderRadius: 999, padding: 6 }}>
            <Icon.search />
          </button>
          <button className="btn btn-ghost btn-sm" style={{ borderRadius: 999, padding: 6, position: 'relative' }}>
            <Icon.bell />
            <span style={{
              position: 'absolute', top: 5, right: 6,
              width: 6, height: 6, borderRadius: 999, background: 'var(--coral)',
            }}/>
          </button>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 5px 4px 12px', borderRadius: 999,
            background: 'var(--paper)', border: '1px solid var(--gray-line)',
            fontSize: 12.5, fontWeight: 600, color: 'var(--charcoal)',
            whiteSpace: 'nowrap',
          }}>
            내 두잉
            <div style={{
              width: 26, height: 26, borderRadius: 999,
              background: 'var(--ink)', color: '#fff',
              display: 'grid', placeItems: 'center',
              fontSize: 11.5, fontWeight: 700,
              flexShrink: 0,
            }}>도</div>
          </div>
        </div>
      </div>
    </header>
  );
}
