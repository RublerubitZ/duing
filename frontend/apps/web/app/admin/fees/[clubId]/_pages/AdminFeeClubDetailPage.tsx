'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { useAdminFeeClubDetailQuery } from '@duing/hooks';
import type { AdminFeeClubDetail } from '@duing/types';

import { toRoute } from '@/app/_lib/route';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { ConsoleCard } from '../../../_components/ConsoleCard';
import { ErrorState } from '../../../_components/ErrorState';
import { FeeAccountCard } from '../../_components/FeeAccountCard';
import { FeeAnomalyList } from '../../_components/FeeAnomalyList';
import { FeeAuditCommentPanel } from '../../_components/FeeAuditCommentPanel';
import { FeeAuditLogList } from '../../_components/FeeAuditLogList';
import { FeeBillsTable } from '../../_components/FeeBillsTable';
import { FeeKpiCards } from '../../_components/FeeKpiCards';
import { FeePaymentsTable } from '../../_components/FeePaymentsTable';
import { FeePeriodSelect } from '../../_components/FeePeriodSelect';
import { FeePoliciesTable } from '../../_components/FeePoliciesTable';
import { formatFeeAmount } from '../../_lib/feeAuditLabels';
import {
  readPeriodValue,
  resolvePeriodParams,
  writePeriodParams,
  type FeePeriodValue,
} from '../../_lib/feePeriod';

const TABS = [
  { key: 'overview', label: '개요' },
  { key: 'policies', label: '정책' },
  { key: 'bills', label: '청구' },
  { key: 'payments', label: '납부' },
  { key: 'account', label: '계좌' },
  { key: 'audit-logs', label: '감사 로그' },
  { key: 'anomalies', label: '이상징후' },
  { key: 'comments', label: '의견·메모' },
] as const;

type FeeDetailTab = (typeof TABS)[number]['key'];

const DEFAULT_TAB: FeeDetailTab = 'overview';

/** 손으로 고친 주소나 사라진 탭 키는 개요로 떨어뜨린다(`as` 단언 없이 좁힌다). */
function resolveTab(raw: string | null): FeeDetailTab {
  return TABS.find((tab) => tab.key === raw)?.key ?? DEFAULT_TAB;
}

/**
 * 동아리 회비 감사 상세(스펙 §8.3) — 개요·정책·청구·납부·계좌 탭.
 *
 * <p>이 화면은 읽기만 한다. 회비 정책·청구·납부·계좌는 전부 동아리 운영진의 소관이고
 * 총동연은 무슨 일이 있었는지만 본다(§2).
 *
 * <p>기간 셀렉터는 헤더에 하나뿐이다 — KPI·정책 납부율·청구·납부가 전부 같은 구간을 봐야
 * 탭을 옮겨 가며 대조한 숫자가 어긋나지 않는다. 기본값은 최근 30일.
 */
export function AdminFeeClubDetailPage({ clubId }: { clubId: number }) {
  const router = useGuardedRouter();
  const searchParams = useSearchParams();
  const period = readPeriodValue(searchParams, 'LAST_30D');
  const activeTab = resolveTab(searchParams.get('tab'));
  const periodParams = resolvePeriodParams(period);

  /**
   * 상세 KPI 는 이 컨테이너에서만 부른다. 호출마다 재무 데이터 열람 이력이 감사 로그에 한 건 남으므로,
   * 탭 컴포넌트가 저마다 이 훅을 두면 탭을 다섯 번 누르는 것만으로 열람 기록이 다섯 배로 부푼다
   * (열람 감사 굵기 = 상세 진입 1회당 1건, §15 결정 5).
   */
  const detailQuery = useAdminFeeClubDetailQuery(clubId, periodParams);
  const detail = detailQuery.data;

  // 기간·탭만 주소에 남긴다 — 청구 탭의 회원 검색어는 방문 기록·referrer 로 새어나가므로 싣지 않는다.
  const syncUrl = (next: { period?: FeePeriodValue; tab?: FeeDetailTab }) => {
    const params = new URLSearchParams();
    writePeriodParams(params, next.period ?? period, 'LAST_30D');
    const nextTab = next.tab ?? activeTab;
    if (nextTab !== DEFAULT_TAB) params.set('tab', nextTab);
    const query = params.toString();
    // replace 라 탭을 훑을 때마다 뒤로가기 기록이 쌓이지 않는다.
    router.replace(toRoute(`/admin/fees/${clubId}${query.length > 0 ? `?${query}` : ''}`), {
      scroll: false,
    });
  };

  return (
    <main className="max-w-layout mx-auto px-4 py-10 sm:px-6 md:px-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={toRoute('/admin/fees')}
            className="text-[13px] text-charcoal-2 hover:text-ink"
          >
            ← 목록으로
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold text-ink">
              {detail?.clubName ?? '회비 감사'}
            </h1>
            {/* 상시 노출한다 — 이 콘솔에서 아무것도 바꿀 수 없음을 화면이 먼저 말해야 한다. */}
            <span className="pill-outline shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold">
              읽기 전용
            </span>
          </div>
        </div>
        <FeePeriodSelect value={period} onChange={(next) => syncUrl({ period: next })} />
      </header>

      {detailQuery.isLoading && (
        <div className="mb-5">
          <ListRowsSkeleton rows={2} rowClassName="h-[70px] rounded-[14px]" label="회비 현황 조회 중" />
        </div>
      )}

      {/* KPI 조회 실패가 탭 전체를 막지 않는다 — 청구·납부·계좌는 별도 조회라 그대로 볼 수 있다. */}
      {detailQuery.isError && (
        <ConsoleCard className="mb-5">
          <ErrorState
            message="동아리 회비 현황을 불러오지 못했어요."
            onRetry={() => void detailQuery.refetch()}
          />
        </ConsoleCard>
      )}

      {detail && <FeeKpiCards detail={detail} />}

      <div
        role="tablist"
        aria-label="회비 감사 상세 탭"
        className="mb-5 flex flex-wrap gap-1 rounded-2xl border border-line bg-paper p-1.5"
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`fee-tab-${tab.key}`}
              aria-selected={isActive}
              // 패널은 선택된 탭 것만 DOM 에 있다 — 나머지에 걸면 없는 id 를 가리키는 참조가 된다.
              aria-controls={isActive ? `fee-tabpanel-${tab.key}` : undefined}
              onClick={() => syncUrl({ tab: tab.key })}
              className={`rounded-[11px] px-4 py-2 text-[13px] font-semibold motion-safe:transition-colors ${
                isActive ? 'bg-ink text-paper' : 'text-charcoal-2 hover:bg-graysoft'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`fee-tabpanel-${activeTab}`}
        aria-labelledby={`fee-tab-${activeTab}`}
        tabIndex={0}
      >
        {activeTab === 'overview' && <OverviewTab detail={detail} />}
        {activeTab === 'policies' && <FeePoliciesTable clubId={clubId} period={periodParams} />}
        {activeTab === 'bills' && <FeeBillsTable clubId={clubId} period={periodParams} />}
        {activeTab === 'payments' && <FeePaymentsTable clubId={clubId} period={periodParams} />}
        {activeTab === 'account' && <FeeAccountCard clubId={clubId} />}
        {activeTab === 'audit-logs' && <FeeAuditLogList clubId={clubId} period={periodParams} />}
        {activeTab === 'anomalies' && <FeeAnomalyList clubId={clubId} period={periodParams} />}
        {/* 의견·메모는 기간과 무관하다 — 감사 기록은 어느 구간을 보고 있든 전부 남아 있어야 한다. */}
        {activeTab === 'comments' && <FeeAuditCommentPanel clubId={clubId} />}
      </div>
    </main>
  );
}

/**
 * 개요 탭. KPI 카드는 탭 위에 상시 노출되므로(스펙 §8.3 와이어프레임) 여기서는 카드에 담기지 않은
 * 사실만 덧붙인다. PR-5 에서 이상징후 요약과 최근 감사 로그 5건이 이 자리에 붙는다.
 */
function OverviewTab({ detail }: { detail?: AdminFeeClubDetail }) {
  return (
    <ConsoleCard className="p-6">
      <dl className="grid grid-cols-1 gap-4 text-[13.5px] sm:grid-cols-2">
        <div>
          <dt className="text-[12px] font-semibold text-charcoal-2">총 청구</dt>
          <dd className="mt-0.5 tabular-nums text-ink">
            {detail === undefined ? '—' : `${formatFeeAmount(detail.totalBilled ?? 0)}원`}
          </dd>
          {/* 건수와 금액의 모수가 다르다는 사실을 적어 두지 않으면 청구 표와 대조할 때 어긋나 보인다. */}
          <dd className="mt-0.5 text-[11.5px] text-charcoal-3">취소된 청구는 금액에서 제외</dd>
        </div>
        <div>
          <dt className="text-[12px] font-semibold text-charcoal-2">BANK 자동매칭</dt>
          <dd className="mt-0.5 text-ink">
            {detail === undefined
              ? '—'
              : detail.bankMatchingActive
                ? '사용 중 — 입금 거래가 청구에 자동으로 연결됩니다.'
                : '사용 안 함 — 납부는 운영진이 직접 기록합니다.'}
          </dd>
        </div>
      </dl>
    </ConsoleCard>
  );
}
