'use client';

import { useAdminFeePoliciesQuery } from '@duing/hooks';
import type { AdminFeePeriodParams } from '@duing/types';

import { billingTypeLabel } from '@/app/_lib/feeLabels';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { ConsoleCard } from '../../_components/ConsoleCard';
import { EmptyState } from '../../_components/EmptyState';
import { ErrorState } from '../../_components/ErrorState';
import { FEE_TARGET_TYPE_LABEL, formatFeeAmount } from '../_lib/feeAuditLabels';

/**
 * 정책 탭(스펙 §8.3) — 행동 버튼이 없다. 정책을 만들고 고치는 것은 동아리 운영진의 일이고
 * 총동연은 무엇이 걸려 있었는지만 본다.
 *
 * <p>발행 건수·납부율은 헤더 기간 안에서 발행된 청구 기준이라 정책의 전 이력이 아니다.
 */
export function FeePoliciesTable({
  clubId,
  period,
}: {
  clubId: number;
  period: AdminFeePeriodParams;
}) {
  const policiesQuery = useAdminFeePoliciesQuery(clubId, period);
  const policies = policiesQuery.data ?? [];

  if (policiesQuery.isLoading) {
    return <ListRowsSkeleton rows={3} rowClassName="h-12 rounded-md" label="회비 정책 조회 중" />;
  }

  if (policiesQuery.isError) {
    return (
      <ConsoleCard>
        <ErrorState
          message="회비 정책을 불러오지 못했어요."
          onRetry={() => void policiesQuery.refetch()}
        />
      </ConsoleCard>
    );
  }

  if (policies.length === 0) {
    return (
      <ConsoleCard>
        <EmptyState
          icon="📄"
          title="회비 정책이 없습니다"
          body={'선택한 기간에 조회되는 정책이 없어요.\n기간을 넓혀보세요.'}
        />
      </ConsoleCard>
    );
  }

  return (
    <ConsoleCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead className="bg-graysoft text-charcoal-2">
            <tr>
              <Th>정책명</Th>
              <Th>대상</Th>
              <Th align="right">금액</Th>
              <Th>유형</Th>
              <Th>상태</Th>
              <Th align="right">발행 건수</Th>
              <Th align="right">납부율</Th>
            </tr>
          </thead>
          <tbody>
            {policies.map((policy) => (
              <tr
                key={policy.policyId}
                className={`border-t border-line ${policy.active ? '' : 'opacity-60'}`}
              >
                <Td>
                  <span className="font-semibold text-charcoal">{policy.name}</span>
                </Td>
                <Td>{FEE_TARGET_TYPE_LABEL[policy.targetType]}</Td>
                <Td align="right">{formatFeeAmount(policy.amount)}</Td>
                <Td>{billingTypeLabel(policy.billingType)}</Td>
                <Td>
                  <span
                    className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                      policy.active ? 'bg-sage-mist text-ink' : 'bg-graysoft text-charcoal-2'
                    }`}
                  >
                    {policy.active ? '활성' : '비활성'}
                  </span>
                </Td>
                <Td align="right">{policy.billCount}</Td>
                <Td align="right">{policy.paymentRate ?? 0}%</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ConsoleCard>
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
