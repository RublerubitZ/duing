'use client';

import { useState, useMemo } from 'react';

import { useMyApplicationsQuery, useMyApplicationDetailQuery } from '@duing/hooks';
import type { ApplicationSummary, ApplicationStatus, ClubCategory } from '@duing/types';

import { ExploreNav } from '@/app/_components/ExploreNav';

import { FILTERS, STATUS_TO_FILTER, PAGE_PAD, PAGE_MAX } from '../_constants/data';
import type { App, FilterKey, Counts, Logo, AppStatus, Step } from '../_constants/data';
import { ApplyStatusHero } from '../_components/ApplyStatusHero';
import { ApplyTopTabs } from '../_components/ApplyTopTabs';
import { ApplyRow } from '../_components/ApplyRow';
import { ApplySummaryCard } from '../_components/ApplySummaryCard';
import { StageFilterCard } from '../_components/StageFilterCard';
import { InfoNoteBox } from '../_components/InfoNoteBox';
import { ApplyDetailModal } from '../_components/ApplyDetailModal';

const CATEGORY_LABELS: Record<ClubCategory, string> = {
  ACADEMIC:  '학술',
  CULTURE:   '문화',
  ART:       '예술',
  SPORTS:    '체육',
  VOLUNTEER: '봉사',
  RELIGION:  '종교',
  HOBBY:     '취미',
  OTHER:     '기타',
};

function toAppStatus(status: ApplicationStatus, interviewAt: string | null): AppStatus {
  switch (status) {
    case 'SUBMITTED':         return 'applied';
    case 'UNDER_REVIEW':      return 'doc-review';
    case 'INTERVIEW_PENDING': return interviewAt ? 'interview-scheduled' : 'interview-pending';
    case 'ACCEPTED':          return 'passed';
    case 'REJECTED':          return 'failed';
  }
}

function deriveSteps(status: ApplicationStatus): Step[] {
  type StepStateValue = 'done' | 'current' | 'pending';
  const stateMap: Record<ApplicationStatus, [StepStateValue, StepStateValue, StepStateValue, StepStateValue]> = {
    SUBMITTED:         ['done', 'pending', 'pending', 'pending'],
    UNDER_REVIEW:      ['done', 'current', 'pending', 'pending'],
    INTERVIEW_PENDING: ['done', 'done',    'current', 'pending'],
    ACCEPTED:          ['done', 'done',    'done',    'done'   ],
    REJECTED:          ['done', 'done',    'done',    'done'   ],
  };
  const [docReceived, docReview, interview, finalResult] = stateMap[status];
  return [
    { label: '서류접수',    date: '-', state: docReceived  },
    { label: '서류심사',    date: '-', state: docReview    },
    { label: '면접/인터뷰', date: '-', state: interview    },
    { label: '최종발표',    date: '-', state: finalResult  },
  ];
}

function deriveRight(status: ApplicationStatus, interviewAt: string | null, interviewLocation: string | null) {
  if (status === 'INTERVIEW_PENDING' && interviewAt) {
    const interviewDate = new Date(interviewAt);
    const dateStr = `${interviewDate.getFullYear()}.${String(interviewDate.getMonth() + 1).padStart(2, '0')}.${String(interviewDate.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(interviewDate.getHours()).padStart(2, '0')}:${String(interviewDate.getMinutes()).padStart(2, '0')}`;
    return { eyebrow: '면접일', value: dateStr, sub: `${timeStr}${interviewLocation ? ` · ${interviewLocation}` : ''}` };
  }
  if (status === 'ACCEPTED') {
    return { eyebrow: '합격', value: '최종 합격' };
  }
  return null;
}

function toLogo(logoUrl: string | null, clubName: string): Logo {
  if (logoUrl) {
    return { kind: 'img', url: logoUrl, bg: '#E8EEE8', fg: '#1F3D2C' };
  }
  const initial = clubName.charAt(0).toUpperCase();
  return { kind: 'wordmark', text: initial, bg: '#2A3828', fg: '#E8EEE8' };
}

function formatDate(iso: string): string {
  const submittedDate = new Date(iso);
  return `${submittedDate.getFullYear()}.${String(submittedDate.getMonth() + 1).padStart(2, '0')}.${String(submittedDate.getDate()).padStart(2, '0')}`;
}

function formatDateTime(iso: string): string {
  const submittedDate = new Date(iso);
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const yearMonthDay = `${submittedDate.getFullYear()}.${String(submittedDate.getMonth() + 1).padStart(2, '0')}.${String(submittedDate.getDate()).padStart(2, '0')}`;
  const hourMinute = `${String(submittedDate.getHours()).padStart(2, '0')}:${String(submittedDate.getMinutes()).padStart(2, '0')}`;
  return `${yearMonthDay} (${dayLabels[submittedDate.getDay()] ?? ''}) ${hourMinute}`;
}

function toApp(summary: ApplicationSummary): App {
  return {
    id: String(summary.id),
    name: summary.clubName,
    cat: CATEGORY_LABELS[summary.category] ?? summary.category,
    tag: summary.recruitmentTitle,
    appliedDate: formatDate(summary.submittedAt),
    appliedAt: formatDateTime(summary.submittedAt),
    division: '-',
    department: '-',
    files: [],
    memo: '',
    steps: deriveSteps(summary.status),
    status: toAppStatus(summary.status, summary.interviewAt),
    right: deriveRight(summary.status, summary.interviewAt, summary.interviewLocation),
    logo: toLogo(summary.logoUrl, summary.clubName),
  };
}

type Props = {
  defaultOpenId?: string | null;
};

export function ApplicationsPage({ defaultOpenId = null }: Props) {
  const [selected, setSelected] = useState<FilterKey[]>(['all']);
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);

  const { data: applicationSummaries, isLoading, isError } = useMyApplicationsQuery();

  const openApplicationId = openId !== null ? Number(openId) : undefined;
  const { data: openDetail } = useMyApplicationDetailQuery(openApplicationId);

  const apps: App[] = useMemo(
    () => (applicationSummaries ?? []).map(toApp),
    [applicationSummaries],
  );

  const toggleFilter = (key: FilterKey) => {
    setSelected(prev => {
      if (key === 'all') return ['all'];
      if (prev.length === 1 && prev[0] === key) return ['all'];
      return [key];
    });
  };

  const counts = useMemo<Counts>(() => {
    const countMap: Counts = { all: apps.length };
    FILTERS.forEach(filterItem => { if (filterItem.key !== 'all') countMap[filterItem.key] = 0; });
    apps.forEach(app => {
      const filterKey = STATUS_TO_FILTER[app.status];
      if (filterKey && countMap[filterKey] != null) countMap[filterKey] = (countMap[filterKey] ?? 0) + 1;
    });
    return countMap;
  }, [apps]);

  const visibleApps = useMemo(() => {
    if (selected.includes('all')) return apps;
    return apps.filter(app => {
      const filterKey = STATUS_TO_FILTER[app.status];
      return filterKey !== undefined && selected.includes(filterKey);
    });
  }, [selected, apps]);

  const openApp = openId ? apps.find(app => app.id === openId) ?? null : null;

  return (
    <div className="duing" style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <ExploreNav />
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isLoading ? (
              <div style={{
                background: 'var(--paper)',
                border: '1px dashed var(--gray-line)',
                borderRadius: 14,
                padding: '48px 24px',
                textAlign: 'center',
                fontSize: 13, color: 'var(--charcoal-3)',
              }}>
                지원 내역을 불러오는 중...
              </div>
            ) : isError ? (
              <div style={{
                background: 'var(--paper)',
                border: '1px dashed var(--gray-line)',
                borderRadius: 14,
                padding: '48px 24px',
                textAlign: 'center',
                fontSize: 13, color: 'var(--charcoal-3)',
              }}>
                지원 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
              </div>
            ) : visibleApps.length === 0 ? (
              <div style={{
                background: 'var(--paper)',
                border: '1px dashed var(--gray-line)',
                borderRadius: 14,
                padding: '48px 24px',
                textAlign: 'center',
                fontSize: 13, color: 'var(--charcoal-3)',
              }}>
                {apps.length === 0 ? '아직 지원한 동아리가 없습니다.' : '선택한 단계에 해당하는 지원 내역이 없습니다.'}
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

            <div style={{ marginTop: 8 }}>
              <InfoNoteBox />
            </div>
          </div>

          <aside style={{
            position: 'sticky', top: 16,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <ApplySummaryCard counts={counts} />
            <StageFilterCard checked={selected} onToggle={toggleFilter} counts={counts} />
          </aside>
        </div>
      </section>

      <ApplyDetailModal
        app={openApp}
        detail={openDetail ?? null}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}
