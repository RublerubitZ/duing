'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { useAdminFeeAnomaliesQuery } from '@duing/hooks';
import { formatDateTimeKst } from '@duing/hooks/datetime';
import type { AdminFeePeriodParams } from '@duing/types';

import { toRoute } from '@/app/_lib/route';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { ConsoleCard } from '../../_components/ConsoleCard';
import { EmptyState } from '../../_components/EmptyState';
import { ErrorState } from '../../_components/ErrorState';
import {
  FEE_SEVERITY_BADGE_CLASS,
  FEE_SEVERITY_LABEL,
  feeEvidenceKeyLabel,
  formatEvidenceValue,
} from '../_lib/feeAuditLabels';
import { FEE_AUDIT_GROUP_PARAM, type FeeEventGroup } from './FeeAuditLogList';

/**
 * 규칙 → 감사 로그 유형그룹. `club_audit_event` 를 읽는 규칙 중 **링크가 근거로 데려가는 것만** 잇는다.
 *
 * <p>FA-01~04 는 청구·납부·거래 테이블 집계라 대응하는 감사 이벤트가 아예 없다.
 * FA-05(동일 운영진 반복 변경)는 판정 축이 행위자인데 evidence 에 actor 식별자가 없고 감사 로그에도
 * 행위자 필터가 없어, 링크를 걸어 봐야 "로그 탭 열기" 이상이 못 된다 — 근거로 데려가지 못하는 링크는 걸지 않는다.
 * FA-06 은 회비 변이 전체가 곧 판정 근거라 그룹 없이 전체 목록으로 보낸다(기간 어긋남은 항목 캡션이 알린다).
 */
const RULE_AUDIT_GROUP: Record<string, FeeEventGroup | 'ALL' | undefined> = {
  'FA-06': 'ALL',
  'FA-07': 'POLICY',
  'FA-08': 'ACCOUNT',
};

/**
 * 헤더 기간을 따르지 않는 규칙의 안내(스펙 §5.1). 짧은 윈도우가 판정 정의의 일부라 기간을 넓혀도 그대로다 —
 * 적어 두지 않으면 "최근 90일을 보고 있는데 왜 24시간 이야기가 나오나"로 읽힌다.
 */
const RULE_WINDOW_NOTE: Record<string, string | undefined> = {
  'FA-05': '고유 윈도우 고정 — 선택한 기간과 무관하게 최근 7일을 봅니다.',
  'FA-06': '고유 윈도우 고정 — 선택한 기간과 무관하게 최근 24시간을 봅니다.',
  'FA-08': '고유 윈도우 고정 — 선택한 기간이 90일보다 짧으면 90일로 넓혀 봅니다.',
};

/**
 * 이상징후 탭(스펙 §8.5). 규칙 평가는 서버가 조회 시점에 그 자리에서 하고, 심각도 내림차순으로 보내온다 —
 * 화면은 받은 순서를 그대로 그린다(다시 정렬하면 서버와 화면의 우선순위가 갈린다).
 *
 * <p>판정 시각(`evaluatedAt`)을 상단에 적는 것은 장식이 아니다. 다른 관리자 조회와 같은 캐시 수명을 쓰므로
 * 탭을 다시 열면 직전 판정이 그대로 보일 수 있고, 그때 지금 보는 판정이 언제 것인지 화면이 말해야 한다.
 * 재평가 버튼은 두지 않는다 — 기간을 바꾸거나 화면을 다시 열면 그 시점 기준으로 다시 묻는다.
 *
 * <p>상세 KPI 훅은 여기에 두지 않는다 — 탭마다 부르면 열람 감사 행이 탭을 누른 횟수만큼 늘어난다(§15 결정 5).
 */
export function FeeAnomalyList({
  clubId,
  period,
}: {
  clubId: number;
  period: AdminFeePeriodParams;
}) {
  const searchParams = useSearchParams();
  const anomaliesQuery = useAdminFeeAnomaliesQuery(clubId, period);
  const report = anomaliesQuery.data;

  if (anomaliesQuery.isLoading) {
    return <ListRowsSkeleton rows={3} rowClassName="h-16 rounded-md" label="이상징후 평가 중" />;
  }

  if (anomaliesQuery.isError) {
    return (
      <ConsoleCard>
        <ErrorState
          message="이상징후를 평가하지 못했어요."
          onRetry={() => void anomaliesQuery.refetch()}
        />
      </ConsoleCard>
    );
  }

  if (report === undefined) return null;

  const evaluatedNote = `평가 시각 ${formatDateTimeKst(report.evaluatedAt)} · 평가 구간 ${report.window.from} ~ ${report.window.to} — 조회 시점에 그때그때 평가한 결과입니다.`;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] leading-relaxed text-charcoal-3">{evaluatedNote}</p>

      {report.anomalies.length === 0 ? (
        <ConsoleCard>
          <EmptyState
            icon="✅"
            title="기간 내 탐지된 이상징후가 없습니다"
            body="탐지 규칙을 모두 평가했지만 걸린 항목이 없어요."
          />
        </ConsoleCard>
      ) : (
        <ConsoleCard>
          <ul aria-label="이상징후 목록">
            {report.anomalies.map((anomaly) => {
              const evidenceEntries = Object.entries(anomaly.evidence);
              const auditGroup = RULE_AUDIT_GROUP[anomaly.ruleId];
              const windowNote = RULE_WINDOW_NOTE[anomaly.ruleId];
              return (
                <li
                  key={anomaly.ruleId}
                  className="border-t border-line px-4 py-3.5 first:border-t-0"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${FEE_SEVERITY_BADGE_CLASS[anomaly.severity]}`}
                    >
                      {FEE_SEVERITY_LABEL[anomaly.severity]}
                    </span>
                    <span className="text-[13.5px] font-bold text-ink">{anomaly.title}</span>
                    <span className="text-[11.5px] tabular-nums text-charcoal-3">
                      {anomaly.ruleId}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-snug text-charcoal-2">
                    {anomaly.description}
                  </p>
                  {windowNote !== undefined && (
                    <p className="mt-0.5 text-[11.5px] leading-snug text-charcoal-3">
                      {windowNote}
                    </p>
                  )}

                  {/*
                    네이티브 details — 접힘 상태는 브라우저가 관리한다(키보드·검색까지 공짜로 따라온다).
                    보여줄 근거도 링크도 없으면 아예 그리지 않는다 — 열어 봐야 빈 상자인 토글은 두지 않는다.
                  */}
                  {(evidenceEntries.length > 0 || auditGroup !== undefined) && (
                    <details className="mt-2">
                      <summary className="w-fit cursor-pointer text-[12px] font-semibold text-charcoal-2">
                        근거 보기
                      </summary>
                      {evidenceEntries.length > 0 && (
                        <dl className="mt-2 grid grid-cols-1 gap-1.5 rounded-md bg-graysoft/50 px-3 py-2.5 text-[12px] sm:grid-cols-2">
                          {evidenceEntries.map(([key, value]) => (
                            <div key={key} className="flex flex-wrap gap-x-1.5">
                              <dt className="text-charcoal-2">{feeEvidenceKeyLabel(key)}</dt>
                              <dd className="tabular-nums text-ink">{formatEvidenceValue(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {auditGroup !== undefined && (
                        <Link
                          href={auditLogHref(clubId, searchParams.toString(), auditGroup)}
                          className="mt-2 inline-block text-[12px] font-semibold text-ink underline underline-offset-2"
                        >
                          관련 감사 로그 보기 →
                        </Link>
                      )}
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </ConsoleCard>
      )}
    </div>
  );
}

/**
 * 감사 로그 탭으로 가는 주소. 지금 주소의 기간을 그대로 물고 탭·유형그룹만 갈아 끼운다 —
 * 기간이 주소에 없는 기본 상태(최근 30일)도 그대로 옮겨져 두 탭이 같은 구간을 보게 된다.
 */
function auditLogHref(clubId: number, currentQuery: string, group: FeeEventGroup | 'ALL') {
  const params = new URLSearchParams(currentQuery);
  params.set('tab', 'audit-logs');
  if (group === 'ALL') params.delete(FEE_AUDIT_GROUP_PARAM);
  else params.set(FEE_AUDIT_GROUP_PARAM, group);
  return toRoute(`/admin/fees/${clubId}?${params.toString()}`);
}
