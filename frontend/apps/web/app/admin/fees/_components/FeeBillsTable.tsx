'use client';

import { useEffect, useState } from 'react';

import { useAdminFeeBillsQuery } from '@duing/hooks';
import { formatDateTimeKst } from '@duing/hooks/datetime';
import type { AdminFeeBillFilter, AdminFeePeriodParams } from '@duing/types';

import { Pagination } from '@/components/Pagination';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { ConsoleCard } from '../../_components/ConsoleCard';
import { EmptyState } from '../../_components/EmptyState';
import { ErrorState } from '../../_components/ErrorState';
import { useDebouncedValue } from '../../_hooks/useDebouncedValue';
import { feeBillStatusBadge, formatFeeAmount } from '../_lib/feeAuditLabels';
import { FeeFilterChips } from './FeeFilterChips';

const PAGE_SIZE = 20;

const FILTER_OPTIONS: { label: string; value?: AdminFeeBillFilter }[] = [
  { label: '전체', value: undefined },
  { label: '완납', value: 'PAID' },
  { label: '미납', value: 'UNPAID' },
  { label: '연체', value: 'OVERDUE' },
  { label: '취소', value: 'CANCELLED' },
];

const inputCls =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/**
 * 청구 탭(스펙 §8.3). 필터·페이지는 이 탭 안의 상태다 — 주소에는 기간과 탭만 싣는다.
 * 회원명·학번 검색어는 주소에 싣지 않는다(관리자 콘솔 규약 — 방문 기록·referrer 유출 방지).
 */
export function FeeBillsTable({
  clubId,
  period,
}: {
  clubId: number;
  period: AdminFeePeriodParams;
}) {
  const [filter, setFilter] = useState<AdminFeeBillFilter | undefined>(undefined);
  const [input, setInput] = useState('');
  const [page, setPage] = useState(0);

  const debouncedQuery = useDebouncedValue(input.trim(), 300);
  const billsQuery = useAdminFeeBillsQuery(clubId, {
    ...period,
    filter,
    q: debouncedQuery || undefined,
    page,
    size: PAGE_SIZE,
  });

  // 헤더에서 기간을 바꾸면 조회 대상이 통째로 바뀐다 — 3페이지를 물고 있으면 대개 빈 목록이 나온다.
  useEffect(() => setPage(0), [period.from, period.to]);

  const bills = billsQuery.data?.content ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          aria-label="회원 검색"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setPage(0);
          }}
          placeholder="회원명 또는 학번으로 검색"
          className={inputCls}
        />
        <FeeFilterChips
          ariaLabel="청구 상태 필터"
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(next) => {
            setFilter(next);
            setPage(0);
          }}
        />
      </div>

      {billsQuery.isLoading && (
        <ListRowsSkeleton rows={5} rowClassName="h-12 rounded-md" label="청구 내역 조회 중" />
      )}

      {billsQuery.isError && (
        <ConsoleCard>
          <ErrorState
            message="청구 내역을 불러오지 못했어요."
            onRetry={() => void billsQuery.refetch()}
          />
        </ConsoleCard>
      )}

      {/* keepPreviousData 전환 중(정렬·필터·기간 변경)에는 이전 목록이 그대로 남는다 —
          딤으로 "지금 보이는 게 갱신 전 데이터"라는 신호를 준다. 감사 콘솔이라 이전 조건의
          미수금·수납액을 새 조건의 결과로 읽으면 안 된다(#906). 툴바는 딤 밖이다. */}
      {billsQuery.isSuccess && (
        <div
          aria-busy={billsQuery.isPlaceholderData}
          className={billsQuery.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
        >
          {bills.length === 0 ? (
            <ConsoleCard>
              <EmptyState
                icon="🔎"
                title="조회 결과가 없습니다"
                body={'검색어를 줄이거나 기간·상태 필터를 바꿔보세요.\n회원명·학번으로 찾을 수 있어요.'}
              />
            </ConsoleCard>
          ) : (
            <ConsoleCard>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1020px] text-[13px]">
                  <thead className="bg-graysoft text-charcoal-2">
                    <tr>
                      <Th>회원</Th>
                      <Th>학번</Th>
                      <Th align="right">기수</Th>
                      <Th>회차</Th>
                      <Th>정책</Th>
                      <Th align="right">금액</Th>
                      <Th align="right">납부액</Th>
                      <Th>상태</Th>
                      <Th>생성일</Th>
                      <Th>마감일</Th>
                      <Th>납부일</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map((bill) => {
                      const badge = feeBillStatusBadge(bill.status, bill.overdue);
                      return (
                        <tr key={bill.billId} className="border-t border-line">
                          {/* 탈퇴 회원은 이름·학번·기수만 지워진다 — 청구 기록 자체는 감사 대상이라 남는다. */}
                          <Td>
                            <span className="font-semibold text-charcoal">
                              {bill.userName ?? '탈퇴 회원'}
                            </span>
                          </Td>
                          <Td>{bill.studentId ?? '—'}</Td>
                          <Td align="right">{bill.generation ?? '—'}</Td>
                          <Td>{bill.billingPeriod}</Td>
                          <Td>
                            {bill.policyName ?? (
                              <span className="text-charcoal-3">삭제된 정책</span>
                            )}
                          </Td>
                          <Td align="right">{formatFeeAmount(bill.amount)}</Td>
                          <Td align="right">{formatFeeAmount(bill.paidAmount)}</Td>
                          <Td>
                            <span
                              className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </Td>
                          <Td>
                            <span className="whitespace-nowrap text-charcoal-3">
                              {formatDateTimeKst(bill.createdAt)}
                            </span>
                          </Td>
                          <Td>
                            <span className="whitespace-nowrap text-charcoal-3">{bill.dueDate}</span>
                          </Td>
                          <Td>
                            <span className="whitespace-nowrap text-charcoal-3">
                              {bill.lastPaidAt === null ? '—' : formatDateTimeKst(bill.lastPaidAt)}
                            </span>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={page}
                totalPages={billsQuery.data?.totalPages ?? 0}
                onChange={setPage}
                ariaLabel="청구 내역 페이지"
                totalElements={billsQuery.data?.totalElements}
                pageSize={PAGE_SIZE}
                className="py-3"
              />
            </ConsoleCard>
          )}
        </div>
      )}
    </div>
  );
}

const Th = ({ children, align }: { children: React.ReactNode; align?: 'right' }) => (
  <th className={`px-3 py-2 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
);
const Td = ({ children, align }: { children: React.ReactNode; align?: 'right' }) => (
  <td className={`px-3 py-2 align-middle ${align === 'right' ? 'text-right tabular-nums' : ''}`}>
    {children}
  </td>
);
