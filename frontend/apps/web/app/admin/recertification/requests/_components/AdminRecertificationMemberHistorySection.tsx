'use client';

import type { AdminClubMemberHistoryRow } from '@duing/types';
import { cn } from '../../../../_lib/cn';
import {
  CLUB_MEMBER_EVENT_TYPE_LABEL,
  CLUB_MEMBER_ROLE_LABEL,
} from '../../../leader-succession/_lib/successionLabels';

type Props = {
  rows: AdminClubMemberHistoryRow[];
};

export function AdminRecertificationMemberHistorySection({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-charcoal-3 text-[13px]">
        최근 회원 이력이 없습니다.
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
            <Th>이전 역할</Th>
            <Th>변경 역할</Th>
            <Th>사유</Th>
            <Th>일시</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-line hover:bg-graysoft/50">
              <Td>
                <span
                  className={cn(
                    'inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold',
                    'bg-sky-100 text-sky-800',
                  )}
                >
                  {CLUB_MEMBER_EVENT_TYPE_LABEL[row.eventType]}
                </span>
              </Td>
              <Td>
                {row.target.name}
                <span className="ml-1 text-charcoal-3 text-[11px]">(ID: {row.target.id})</span>
              </Td>
              <Td>
                {row.actor.name}
                <span className="ml-1 text-charcoal-3 text-[11px]">(ID: {row.actor.id})</span>
              </Td>
              <Td>{row.fromRole ? CLUB_MEMBER_ROLE_LABEL[row.fromRole] : '—'}</Td>
              <Td>{row.toRole ? CLUB_MEMBER_ROLE_LABEL[row.toRole] : '—'}</Td>
              <Td>{row.reason ?? '—'}</Td>
              <Td>{new Date(row.createdAt).toLocaleString('ko-KR')}</Td>
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
