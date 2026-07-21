'use client';

import Link from 'next/link';
import { formatDateTimeKst } from '@duing/hooks';
import type { AdminSuccessionSummary } from '@duing/types';
import { cn } from '../../../_lib/cn';
import { toRoute } from '../../../_lib/route';
import { SUCCESSION_STATUS_LABEL, SUCCESSION_STATUS_BADGE_CLASS } from '../_lib/successionLabels';

type Props = {
  items: AdminSuccessionSummary[];
};

export function AdminSuccessionTable({ items }: Props) {
  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-charcoal-3 text-[13px]">
        조건에 맞는 승계 요청이 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-graysoft text-charcoal-2">
          <tr>
            <Th>상태</Th>
            <Th>동아리명</Th>
            <Th>요청자</Th>
            <Th>요청 일시</Th>
            <Th>상세</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-line hover:bg-graysoft/50">
              <Td>
                <span
                  className={cn(
                    'inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold',
                    SUCCESSION_STATUS_BADGE_CLASS[item.status],
                  )}
                >
                  {SUCCESSION_STATUS_LABEL[item.status]}
                </span>
              </Td>
              <Td>{item.clubName}</Td>
              <Td>{item.requester.name}</Td>
              <Td>{formatDateTimeKst(item.createdAt)}</Td>
              <Td>
                <Link
                  href={toRoute(`/admin/leader-succession/${item.id}`)}
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
const Td = ({ children }: { children: React.ReactNode }) => (
  <td className="px-3 py-2 align-middle">{children}</td>
);
