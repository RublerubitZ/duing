'use client';

import { useState, useMemo } from 'react';

import { notFound } from 'next/navigation';

import {
  formatDateKst,
  formatTimeKst,
  kstDateTimeFormatter,
  parseKstInstant,
  useMyApplicationsQuery,
  useMyApplicationDetailQuery,
} from '@duing/hooks';
import type {
  ApplicationSummary,
  ApplicationStatus,
  AssignedInterview,
  ClubCategory,
  RecruitmentStatus,
} from '@duing/types';

import { ExploreNav } from '@/app/_components/ExploreNav';
import {
  APPLICATION_STATUS_APPLICANT_LABEL,
  isClosedWithoutResult,
} from '@/app/_constants/application-status';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';

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
  CREATION:  '창작',
  ART:       '예술',
  SPORTS:    '운동',
  VOLUNTEER: '봉사',
  RELIGION:  '종교',
  HOBBY:     '취미',
  OTHER:     '기타',
};

export function toAppStatus(
  status: ApplicationStatus,
  interview: AssignedInterview | null,
  recruitmentStatus: RecruitmentStatus | undefined,
): AppStatus {
  // 모집이 마감됐는데 결과가 없으면 진행 표기(심사 중·면접)는 전부 거짓이다 — 상태 파생 전에 가른다.
  if (isClosedWithoutResult(status, recruitmentStatus)) return 'closed-unresolved';
  switch (status) {
    case 'SUBMITTED':         return 'applied';
    // 보류는 지원자에게 심사 중과 동일하다 — 별도 시각 구분을 두지 않는다 (스펙 §1-1).
    case 'ON_HOLD':           return 'applied';
    case 'INTERVIEW_PENDING': return interview ? 'interview-scheduled' : 'interview-pending';
    case 'ACCEPTED':          return 'passed';
    case 'REJECTED':          return 'failed';
  }
}

function deriveSteps(
  status: ApplicationStatus,
  recruitmentStatus: RecruitmentStatus | undefined,
): Step[] {
  type StepStateValue = 'done' | 'current' | 'pending';
  // 결과 없이 종료된 지원은 어느 단계도 "진행 중"이 아니다 — 현재 단계 점을 없애 멈춘 진행바로 보이지 않게 한다.
  if (isClosedWithoutResult(status, recruitmentStatus)) {
    return [
      { label: '심사',      date: '-', state: 'done'    },
      { label: '면접',      date: '-', state: 'pending' },
      { label: '최종 결과', date: '-', state: 'pending' },
    ];
  }
  const stateMap: Record<ApplicationStatus, [StepStateValue, StepStateValue, StepStateValue]> = {
    SUBMITTED:         ['current', 'pending', 'pending'],
    ON_HOLD:           ['current', 'pending', 'pending'], // 지원자에게 심사 중과 동일
    INTERVIEW_PENDING: ['done',    'current', 'pending'],
    ACCEPTED:          ['done',    'done',    'done'   ],
    REJECTED:          ['done',    'done',    'done'   ],
  };
  const [screening, interview, finalResult] = stateMap[status];
  // 단계 이름은 상태 라벨이 아니라 진행 마디다 — SectionApply(['심사','면접'])·
  // ApplicationStepper('최종 결과') 와 같은 용어를 쓴다. 서류 단계는 제거됐다 (스펙 §5-5).
  return [
    { label: '심사',      date: '-', state: screening   },
    { label: '면접',      date: '-', state: interview   },
    { label: '최종 결과', date: '-', state: finalResult },
  ];
}

function deriveRight(
  status: ApplicationStatus,
  interview: AssignedInterview | null,
  recruitmentStatus: RecruitmentStatus | undefined,
) {
  // 마감된 모집의 면접 일정은 이미 지났거나 열리지 않는다 — 다가올 일정처럼 보이면 안 된다.
  if (isClosedWithoutResult(status, recruitmentStatus)) return null;
  if (status === 'INTERVIEW_PENDING' && interview) {
    const dateStr = formatDateKst(interview.startAt);
    const timeStr = formatTimeKst(interview.startAt);
    const sub = interview.location ? `${timeStr} · ${interview.location}` : timeStr;
    return { eyebrow: '면접일', value: dateStr, sub };
  }
  if (status === 'ACCEPTED') {
    return { eyebrow: '결과', value: APPLICATION_STATUS_APPLICANT_LABEL.ACCEPTED };
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

// KST 요일 — "YYYY.MM.DD (요일) HH:mm" 구조 유지용.
const WEEKDAY_FORMATTER = kstDateTimeFormatter({ weekday: 'short' });

function formatDateTime(iso: string): string {
  return `${formatDateKst(iso)} (${WEEKDAY_FORMATTER.format(parseKstInstant(iso))}) ${formatTimeKst(iso)}`;
}

function toApp(summary: ApplicationSummary): App {
  return {
    id: String(summary.id),
    name: summary.clubName,
    cat: CATEGORY_LABELS[summary.category] ?? summary.category,
    tag: summary.recruitmentTitle,
    appliedDate: formatDateKst(summary.submittedAt),
    appliedAt: formatDateTime(summary.submittedAt),
    division: '-',
    department: '-',
    files: [],
    memo: '',
    steps: deriveSteps(summary.status, summary.recruitmentStatus),
    status: toAppStatus(summary.status, summary.interview, summary.recruitmentStatus),
    right: deriveRight(summary.status, summary.interview, summary.recruitmentStatus),
    logo: toLogo(summary.logoUrl, summary.clubName),
  };
}

type Props = {
  defaultOpenId?: string | null;
};

export function ApplicationsPage({ defaultOpenId = null }: Props) {
  const [selected, setSelected] = useState<FilterKey[]>(['all']);
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);

  const { data: applicationSummaries, isLoading, isFetching, isError } = useMyApplicationsQuery();

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

  // 딥링크로 들어왔는데 목록이 다 온 뒤에도 그 지원서가 없다면 남의 것이거나 존재하지 않는다.
  // 그대로 두면 서버의 403·404 가 삼켜지고 평범한 목록만 렌더돼 학생이 무엇이 잘못됐는지 알 수 없다.
  // (권한 없는 관리 페이지를 notFound 로 보내는 전례와 같은 처리 — 존재 여부도 알리지 않는다.)
  //
  // 판정 기준은 "로딩 중이 아님"이 아니라 "권위 있는 답을 받았음"이다. isLoading 은
  // isPending && isFetching 이라 (1) 비활성 쿼리(이 훅은 enabled: isAuthenticated 라 서버 렌더에서
  // 꺼져 있다) 와 (2) 옛 데이터를 든 채 재검증 중인 쿼리 에서 모두 false 다. 그 둘을 답으로 오해하면
  // 정당한 주인의 딥링크가 404 로 끊긴다 — 이 라우트는 면접 알림의 목적지라 오탐이 훨씬 비싸다.
  //
  // 그리고 "지금도 그 딥링크를 보고 있을 때"만 판정한다. 모달을 닫으면 openId 만 비고 defaultOpenId
  // 는 남는데, 철회 성공 콜백도 같은 닫기를 부르고 철회는 목록에서 그 지원을 지우므로(soft delete)
  // prop 만 보고 대조하면 정상 철회가 토스트 대신 404 가 된다.
  const deepLinkStillOpen = defaultOpenId !== null && openId === defaultOpenId;
  const listAnswered = applicationSummaries !== undefined && !isFetching && !isError;
  if (deepLinkStillOpen && listAnswered && openApp === null) {
    notFound();
  }

  return (
    // min-h-dvh — 안드로이드 크롬에서 100vh 는 주소창이 접힌 큰 뷰포트라 문서가 화면보다 길어진다.
    <div className="duing min-h-dvh bg-cream">
      <ExploreNav slimOnMobile />
      <ApplyStatusHero />
      <ApplyTopTabs active={selected} onToggle={toggleFilter} counts={counts} />

      <section style={{ padding: `16px ${PAGE_PAD} 40px` }}>
        <div
          className="mx-auto grid grid-cols-1 items-start gap-4 md:grid-cols-[1fr_200px]"
          style={{ maxWidth: PAGE_MAX }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isLoading ? (
              <ListRowsSkeleton
                rows={4}
                rowClassName="h-[84px] rounded-[14px]"
                className="space-y-2"
                label="지원 내역 불러오는 중"
              />
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

          {/* 요약·단계 필터 사이드바 — 데스크탑 전용. 모바일은 상단 ApplyTopTabs 가 필터를 제공한다. */}
          <aside className="sticky top-4 hidden flex-col gap-3 md:flex">
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
