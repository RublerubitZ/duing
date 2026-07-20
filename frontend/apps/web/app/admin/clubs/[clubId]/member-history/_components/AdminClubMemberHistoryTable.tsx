'use client';

import { formatDateTimeKst } from '@duing/hooks';
import type { AdminClubMemberHistoryRow } from '@duing/types';
import {
  CLUB_MEMBER_EVENT_TYPE_LABEL,
  CLUB_MEMBER_ROLE_LABEL,
} from '../../../../leader-succession/_lib/successionLabels';

type Props = {
  items: AdminClubMemberHistoryRow[];
};

export function AdminClubMemberHistoryTable({ items }: Props) {
  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-charcoal-3 text-[13px]">
        조건에 맞는 이력이 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-graysoft text-charcoal-2">
          <tr>
            <Th>이벤트</Th>
            <Th>대상</Th>
            <Th>처리자</Th>
            <Th>역할 변경</Th>
            <Th>사유</Th>
            <Th>일시</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id} className="border-t border-line hover:bg-graysoft/50">
              <Td>{CLUB_MEMBER_EVENT_TYPE_LABEL[row.eventType]}</Td>
              <Td>
                {row.target.name}
                <span className="ml-1 text-charcoal-3 text-[11px]">(ID: {row.target.id})</span>
              </Td>
              <Td>
                {row.actor.name}
                <span className="ml-1 text-charcoal-3 text-[11px]">(ID: {row.actor.id})</span>
              </Td>
              <Td>
                {row.fromRole || row.toRole ? (
                  <span>
                    {row.fromRole ? CLUB_MEMBER_ROLE_LABEL[row.fromRole] : '—'}
                    {' → '}
                    {row.toRole ? CLUB_MEMBER_ROLE_LABEL[row.toRole] : '—'}
                  </span>
                ) : (
                  <span className="text-charcoal-3">—</span>
                )}
              </Td>
              <Td>
                <span className="text-charcoal-2">{row.reason ?? '—'}</span>
              </Td>
              <Td>{formatDateTimeKst(row.createdAt)}</Td>
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
