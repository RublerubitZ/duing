'use client';

/* a-apply-status-page.jsx → TypeScript 변환: ApplyStatusPage → ApplicationsPage */

import { useState, useMemo } from 'react';
import { APPS, FILTERS, STATUS_TO_FILTER, PAGE_PAD, PAGE_MAX } from '../_constants/data';
import { ApplyStatusNav } from '../_components/ApplyStatusNav';
import { ApplyStatusHero } from '../_components/ApplyStatusHero';
import { ApplyTopTabs } from '../_components/ApplyTopTabs';
import { ApplyRow } from '../_components/ApplyRow';
import { ApplySummaryCard } from '../_components/ApplySummaryCard';
import { StageFilterCard } from '../_components/StageFilterCard';
import { InfoNoteBox } from '../_components/InfoNoteBox';
import { ApplyDetailModal } from '../_components/ApplyDetailModal';
import type { FilterKey, Counts } from '../_constants/data';

type Props = {
  defaultOpenId?: string | null;
};

export function ApplicationsPage({ defaultOpenId = null }: Props) {
  const [selected, setSelected] = useState<FilterKey[]>(['all']);
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);

  /* 통합 토글 — 단일 선택 모드 (한 번에 하나만 활성화) */
  const toggleFilter = (key: FilterKey) => {
    setSelected(prev => {
      if (key === 'all') return ['all'];
      // 같은 키 다시 클릭 → 전체로 복귀
      if (prev.length === 1 && prev[0] === key) return ['all'];
      // 다른 키 클릭 → 그 키 하나만 활성화
      return [key];
    });
  };

  /* 각 필터별 카운트 — STATUS_TO_FILTER 매핑 기반 */
  const counts = useMemo<Counts>(() => {
    const countMap: Counts = { all: APPS.length };
    FILTERS.forEach(filterItem => { if (filterItem.key !== 'all') countMap[filterItem.key] = 0; });
    APPS.forEach(app => {
      const filterKey = STATUS_TO_FILTER[app.status];
      if (filterKey && countMap[filterKey] != null) countMap[filterKey] = (countMap[filterKey] ?? 0) + 1;
    });
    return countMap;
  }, []);

  /* 필터링된 앱 목록 */
  const visibleApps = useMemo(() => {
    if (selected.includes('all')) return APPS;
    return APPS.filter(app => {
      const filterKey = STATUS_TO_FILTER[app.status];
      return filterKey !== undefined && selected.includes(filterKey);
    });
  }, [selected]);

  const openApp = openId ? APPS.find(app => app.id === openId) ?? null : null;

  return (
    <div className="duing" style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <ApplyStatusNav />
      <ApplyStatusHero />
      <ApplyTopTabs active={selected} onToggle={toggleFilter} counts={counts} />

      <section style={{ padding: `16px ${PAGE_PAD} 40px` }}>
        <div style={{
          maxWidth: PAGE_MAX, margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1fr 200px',
          gap: 16,
          alignItems: 'start',
        }}>
          {/* Left — applications list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleApps.length === 0 ? (
              <div style={{
                background: 'var(--paper)',
                border: '1px dashed var(--gray-line)',
                borderRadius: 14,
                padding: '48px 24px',
                textAlign: 'center',
                fontSize: 13, color: 'var(--charcoal-3)',
              }}>
                선택한 단계에 해당하는 지원 내역이 없습니다.
              </div>
            ) : (
              visibleApps.map(app => (
                <ApplyRow
                  key={app.id}
                  app={app}
                  isActive={openId === app.id}
                  onOpen={(id) => setOpenId(id)}
                />
              ))
            )}

            {/* 알아두세요 — 카드 리스트 아래에 끼움 */}
            <div style={{ marginTop: 8 }}>
              <InfoNoteBox />
            </div>
          </div>

          {/* Right — sidebar */}
          <aside style={{
            position: 'sticky', top: 16,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <ApplySummaryCard counts={counts} />
            <StageFilterCard checked={selected} onToggle={toggleFilter} counts={counts} />
          </aside>
        </div>
      </section>

      <ApplyDetailModal app={openApp} onClose={() => setOpenId(null)} />
    </div>
  );
}
