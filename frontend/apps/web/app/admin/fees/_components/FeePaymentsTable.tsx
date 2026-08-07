'use client';

import { useEffect, useState } from 'react';

import { useAdminFeePaymentsQuery } from '@duing/hooks';
import { formatDateTimeKst } from '@duing/hooks/datetime';
import type { AdminFeePeriodParams, PaymentStatus } from '@duing/types';

import { Pagination } from '@/components/Pagination';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { ConsoleCard } from '../../_components/ConsoleCard';
import { EmptyState } from '../../_components/EmptyState';
import { ErrorState } from '../../_components/ErrorState';
import {
  FEE_MATCH_TYPE_LABEL,
  FEE_PAYMENT_STATUS_LABEL,
  formatFeeAmount,
} from '../_lib/feeAuditLabels';
import { FeeFilterChips } from './FeeFilterChips';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { label: string; value?: PaymentStatus }[] = [
  { label: '전체', value: undefined },
  { label: '유효', value: 'ACTIVE' },
  { label: '정정됨', value: 'VOIDED' },
];

/**
 * 납부 탭(스펙 §8.3). 정정(VOIDED)된 납부도 함께 싣는다 — 누가·언제·왜 정정했는지가 감사의 핵심이다.
 *
 * <p>정정 사유는 툴팁이 아니라 행 아래 텍스트 줄로 둔다. 툴팁은 터치 기기에서 열 방법이 마땅치 않아
 * 모바일에서는 사유가 아예 보이지 않게 된다.
 */
export function FeePaymentsTable({
  clubId,
  period,
}: {
  clubId: number;
  period: AdminFeePeriodParams;
}) {
  const [status, setStatus] = useState<PaymentStatus | undefined>(undefined);
  const [page, setPage] = useState(0);

  const paymentsQuery = useAdminFeePaymentsQuery(clubId, {
    ...period,
    status,
    page,
    size: PAGE_SIZE,
  });

  // 기간이 바뀌면 조회 대상이 통째로 바뀐다 — 뒷 페이지를 물고 있으면 대개 빈 목록이 나온다.
  useEffect(() => setPage(0), [period.from, period.to]);

  const payments = paymentsQuery.data?.content ?? [];

  return (
    <div className="flex flex-col gap-3">
      <FeeFilterChips
        ariaLabel="납부 상태 필터"
        options={STATUS_OPTIONS}
        value={status}
        onChange={(next) => {
          setStatus(next);
          setPage(0);
        }}
      />

      {paymentsQuery.isLoading && (
        <ListRowsSkeleton rows={5} rowClassName="h-12 rounded-md" label="납부 내역 조회 중" />
      )}

      {paymentsQuery.isError && (
        <ConsoleCard>
          <ErrorState
            message="납부 내역을 불러오지 못했어요."
            onRetry={() => void paymentsQuery.refetch()}
          />
        </ConsoleCard>
      )}

      {paymentsQuery.isSuccess &&
        (payments.length === 0 ? (
          <ConsoleCard>
            <EmptyState
              icon="🧾"
              title="납부 내역이 없습니다"
              body={'선택한 기간에 기록된 납부가 없어요.\n기간이나 상태 필터를 바꿔보세요.'}
            />
          </ConsoleCard>
        ) : (
          <ConsoleCard>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-[13px]">
                <thead className="bg-graysoft text-charcoal-2">
                  <tr>
                    <Th>입금자</Th>
                    <Th>회원</Th>
                    <Th align="right">금액</Th>
                    <Th>입금일</Th>
                    <Th>매칭</Th>
                    <Th>기록자</Th>
                    <Th>상태</Th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => {
                    const voided = payment.status === 'VOIDED';
                    // 정정된 행은 취소선으로 "이 금액은 집계에서 빠졌다"를 한눈에 알린다.
                    const cellCls = voided ? 'text-charcoal-3 line-through' : '';
                    return (
                      <tr key={payment.paymentId} className="border-t border-line">
                        <Td className={cellCls}>{payment.counterparty ?? '—'}</Td>
                        <Td className={cellCls}>{payment.userName ?? '탈퇴 회원'}</Td>
                        <Td align="right" className={cellCls}>
                          {formatFeeAmount(payment.amount)}
                        </Td>
                        <Td className={cellCls}>
                          <span className="whitespace-nowrap">
                            {formatDateTimeKst(payment.paidAt)}
                          </span>
                        </Td>
                        <Td>
                          <span className="pill-outline inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold">
                            {FEE_MATCH_TYPE_LABEL[payment.matchType]}
                          </span>
                        </Td>
                        <Td className={cellCls}>{payment.recordedByName ?? '—'}</Td>
                        <Td>
                          <span
                            className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                              voided ? 'pill-coral' : 'bg-sage-mist text-ink'
                            }`}
                          >
                            {FEE_PAYMENT_STATUS_LABEL[payment.status]}
                          </span>
                          {voided && (
                            <span className="mt-1 block whitespace-normal text-[11.5px] leading-snug text-charcoal-2">
                              {payment.voidReason ?? '사유 없음'}
                              {payment.voidedByName !== null && ` · ${payment.voidedByName}`}
                              {payment.voidedAt !== null &&
                                ` · ${formatDateTimeKst(payment.voidedAt)}`}
                            </span>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={paymentsQuery.data?.totalPages ?? 0}
              onChange={setPage}
              ariaLabel="납부 내역 페이지"
              totalElements={paymentsQuery.data?.totalElements}
              pageSize={PAGE_SIZE}
              className="py-3"
            />
          </ConsoleCard>
        ))}
    </div>
  );
}

const Th = ({ children, align }: { children: React.ReactNode; align?: 'right' }) => (
  <th className={`px-3 py-2 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
);
const Td = ({
  children,
  align,
  className = '',
}: {
  children: React.ReactNode;
  align?: 'right';
  className?: string;
}) => (
  <td
    className={`px-3 py-2 align-top ${align === 'right' ? 'text-right tabular-nums' : ''} ${className}`}
  >
    {children}
  </td>
);
