'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAdminFeeAuditLogsQuery } from '@duing/hooks';
import { formatDateTimeKst } from '@duing/hooks/datetime';
import type { AdminFeeAuditLog, AdminFeePeriodParams, FeeAuditEventType } from '@duing/types';

import { Pagination } from '@/components/Pagination';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { ConsoleCard } from '../../_components/ConsoleCard';
import { EmptyState } from '../../_components/EmptyState';
import { ErrorState } from '../../_components/ErrorState';
import { feeEventTypeLabel, formatAuditDetail } from '../_lib/feeAuditLabels';
import { FeeFilterChips } from './FeeFilterChips';

const PAGE_SIZE = 20;

export type FeeEventGroup = 'POLICY' | 'BILL' | 'PAYMENT' | 'MATCH' | 'ACCOUNT' | 'VIEW';

/** 이상징후 탭이 "이 유형의 로그를 보라"고 넘겨줄 때 쓰는 질의 키. 양쪽이 같은 이름을 봐야 필터가 걸린다. */
export const FEE_AUDIT_GROUP_PARAM = 'group';

/**
 * 유형그룹 → 서버에 보낼 이벤트 타입. 이벤트 15종을 빠짐없이 나눠 담는다 —
 * 어느 그룹에도 없는 타입은 '전체'로만 보이게 되어 필터가 조용히 놓치므로, 전수 여부는 테스트가 지킨다.
 * 열람(VIEW)은 동아리가 한 일이 아니라 총동연 자신의 조회 이력이라 따로 세운다.
 */
export const FEE_EVENT_GROUP_TYPES: Record<FeeEventGroup, FeeAuditEventType[]> = {
  POLICY: ['FEE_POLICY_CREATED', 'FEE_POLICY_UPDATED', 'FEE_POLICY_DELETED'],
  BILL: ['FEE_BILL_ISSUED', 'FEE_BILL_CANCELLED'],
  PAYMENT: ['FEE_PAYMENT_RECORDED', 'FEE_PAYMENT_VOIDED'],
  MATCH: ['FEE_TX_MANUAL_MATCHED', 'FEE_TX_IGNORED', 'FEE_TX_UNMATCHED'],
  ACCOUNT: ['FEE_ACCOUNT_REGISTERED', 'FEE_ACCOUNT_UPDATED', 'FEE_ACCOUNT_DELETED'],
  VIEW: ['FEE_ADMIN_DETAIL_VIEWED', 'FEE_ADMIN_CSV_DOWNLOADED'],
};

const GROUP_OPTIONS: { label: string; value?: FeeEventGroup }[] = [
  { label: '전체', value: undefined },
  { label: '정책', value: 'POLICY' },
  { label: '청구', value: 'BILL' },
  { label: '납부', value: 'PAYMENT' },
  { label: '매칭', value: 'MATCH' },
  { label: '계좌', value: 'ACCOUNT' },
  { label: '열람', value: 'VIEW' },
];

/**
 * 감사 로그 탭(스펙 §8.4). 표가 아니라 행 나열이다 — detail 요약과 사유는 길이가 제각각이라
 * 열에 가두면 잘리거나 표가 옆으로 흐른다.
 *
 * <p>상세 KPI 훅은 여기에 두지 않는다. 이 화면은 컨테이너가 진입당 한 번만 상세를 조회하고,
 * 탭이 그 훅을 또 부르면 열람 감사 행이 탭을 누른 횟수만큼 늘어난다(§15 결정 5).
 */
export function FeeAuditLogList({
  clubId,
  period,
}: {
  clubId: number;
  period: AdminFeePeriodParams;
}) {
  const searchParams = useSearchParams();
  /**
   * 이상징후 탭에서 넘어왔다면 그 유형그룹으로 열어 준다. 첫 렌더에서만 읽는다 —
   * 이후 칩 조작은 주소에 싣지 않는 규약이라(관리자 콘솔) 주소를 계속 따라가면 사용자의 선택을 되돌린다.
   */
  const [group, setGroup] = useState<FeeEventGroup | undefined>(
    () =>
      GROUP_OPTIONS.find((option) => option.value === searchParams.get(FEE_AUDIT_GROUP_PARAM))
        ?.value,
  );
  const [page, setPage] = useState(0);

  /**
   * 시드로 한 번 쓴 뒤 주소에서 지운다(1회성 소비). 남겨 두면 사용자가 칩을 '전체'로 되돌린 뒤
   * 새로고침·뒤로가기로 이 화면이 다시 뜰 때 꺼 둔 필터가 되살아난다 — 주소가 화면과 다른 말을 하는 상태다.
   *
   * <p>`router.replace` 가 아니라 히스토리 API 를 쓴다(backDismiss 선례). 이건 이동이 아니라 진입 정리라
   * RSC 왕복이 필요 없고, 오프라인에서 useGuardedRouter 가 띄우는 네트워크 오류 토스트도 헛경보가 된다.
   * 칩 조작은 여전히 주소에 쓰지 않는다(관리자 콘솔 규약) — 지우기만 한다.
   */
  useEffect(() => {
    if (!searchParams.has(FEE_AUDIT_GROUP_PARAM)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete(FEE_AUDIT_GROUP_PARAM);
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query.length > 0 ? `?${query}` : ''}`,
    );
    // 마운트 1회만 — 이후 주소 변화는 컨테이너(탭·기간)의 몫이고, 여기서 다시 지울 것이 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const auditLogsQuery = useAdminFeeAuditLogsQuery(clubId, {
    ...period,
    // 모듈 상수를 그대로 넘겨 배열 참조가 렌더마다 바뀌지 않게 한다(React Query 키 안정).
    types: group === undefined ? undefined : FEE_EVENT_GROUP_TYPES[group],
    page,
    size: PAGE_SIZE,
  });

  // 헤더에서 기간을 바꾸면 조회 대상이 통째로 바뀐다 — 뒷 페이지를 물고 있으면 대개 빈 목록이 나온다.
  useEffect(() => setPage(0), [period.from, period.to]);

  const logs = auditLogsQuery.data?.content ?? [];

  return (
    <div className="flex flex-col gap-3">
      <FeeFilterChips
        ariaLabel="이벤트 유형 필터"
        options={GROUP_OPTIONS}
        value={group}
        onChange={(next) => {
          setGroup(next);
          setPage(0);
        }}
      />

      {auditLogsQuery.isLoading && (
        <ListRowsSkeleton rows={6} rowClassName="h-14 rounded-md" label="감사 로그 조회 중" />
      )}

      {auditLogsQuery.isError && (
        <ConsoleCard>
          <ErrorState
            message="감사 로그를 불러오지 못했어요."
            onRetry={() => void auditLogsQuery.refetch()}
          />
        </ConsoleCard>
      )}

      {auditLogsQuery.isSuccess &&
        (logs.length === 0 ? (
          <ConsoleCard>
            <EmptyState
              icon="🗒️"
              title="감사 로그가 없습니다"
              body={
                '선택한 기간·유형에 기록된 변경이 없어요.\n감사 로그는 계측 배포 이후의 변경부터 기록됩니다.'
              }
            />
          </ConsoleCard>
        ) : (
          <ConsoleCard>
            <ul aria-label="회비 감사 로그">
              {logs.map((log) => {
                // 요약과 사유는 둘 다 없을 수 있다 — 없으면 줄 자체를 그리지 않아 빈 여백이 남지 않게 한다.
                const note = [formatAuditDetail(log.detail), log.reason ? `사유: ${log.reason}` : '']
                  .filter((part) => part !== '')
                  .join(' · ');
                return (
                  <li key={log.eventId} className="border-t border-line px-4 py-3 first:border-t-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                      <time
                        dateTime={log.createdAt}
                        className="whitespace-nowrap tabular-nums text-charcoal-3"
                      >
                        {formatDateTimeKst(log.createdAt)}
                      </time>
                      <span className="pill-outline inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold">
                        {feeEventTypeLabel(log.eventType)}
                      </span>
                      <span className="text-charcoal">{actorLabel(log)}</span>
                    </div>
                    {note !== '' && (
                      <p className="mt-1 text-[12.5px] leading-snug text-charcoal-2">{note}</p>
                    )}
                  </li>
                );
              })}
            </ul>
            <Pagination
              page={page}
              totalPages={auditLogsQuery.data?.totalPages ?? 0}
              onChange={setPage}
              ariaLabel="감사 로그 페이지"
              totalElements={auditLogsQuery.data?.totalElements}
              pageSize={PAGE_SIZE}
              className="py-3"
            />
          </ConsoleCard>
        ))}
    </div>
  );
}

/**
 * 행위자 표기. 탈퇴하면 이름만 비고 id 는 남으므로 그때는 "누군가 사람이 했다"까지는 말할 수 있다.
 * 이름도 id 도 없으면 사람이 아니라 시스템이 한 일이다(자동 발행·연체 전이 등).
 */
function actorLabel(log: AdminFeeAuditLog): string {
  if (log.actorName !== null) return log.actorName;
  return log.actorUserId === null ? '시스템' : '탈퇴 회원';
}
