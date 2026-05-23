'use client';

import Link from 'next/link';
import type { AdminPromotionRequestSummary } from '@duing/types';
import { cn } from '../../../_lib/cn';
import { toRoute } from '../../../_lib/route';
import {
  PROMOTION_REQUEST_STATUS_LABEL,
  PROMOTION_REQUEST_STATUS_BADGE_CLASS,
} from '../_lib/promotionRequestLabels';

type Props = {
  items: AdminPromotionRequestSummary[];
};

export function AdminPromotionRequestsTable({ items }: Props) {
  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-charcoal-3 text-[13px]">
        조건에 맞는 홍보 요청이 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-graysoft text-charcoal-2">
          <tr>
            <Th>상태</Th>
            <Th>동아리</Th>
            <Th>요청자</Th>
            <Th>제목</Th>
            <Th>신청 일시</Th>
            <Th>상세</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((request) => (
            <tr key={request.id} className="border-t border-line hover:bg-graysoft/50">
              <Td>
                <span
                  className={cn(
                    'inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold',
                    PROMOTION_REQUEST_STATUS_BADGE_CLASS[request.status],
                  )}
                >
                  {PROMOTION_REQUEST_STATUS_LABEL[request.status]}
                </span>
              </Td>
              <Td>{request.club.name}</Td>
              <Td>{request.requester.name}</Td>
              <Td className="max-w-xs truncate">{request.title}</Td>
              <Td>{new Date(request.createdAt).toLocaleString('ko-KR')}</Td>
              <Td>
                <Link
                  href={toRoute(`/admin/promotion-requests/${request.id}`)}
                  className="text-[12px] text-charcoal-2 hover:text-ink hover:underline"
                >
                  상세 보기
                </Link>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left px-3 py-2 font-semibold">{children}</th>
);

const Td = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => <td className={cn('px-3 py-2 align-middle', className)}>{children}</td>;
