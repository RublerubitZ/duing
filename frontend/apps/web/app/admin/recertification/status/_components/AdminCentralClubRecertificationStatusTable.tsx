'use client';

import type { CentralClubRecertificationStatus } from '@duing/types';
import { cn } from '../../../../_lib/cn';

type Props = {
  items: CentralClubRecertificationStatus[];
};

export function AdminCentralClubRecertificationStatusTable({ items }: Props) {
  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-charcoal-3 text-[13px]">
        조건에 맞는 동아리가 없습니다.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-graysoft text-charcoal-2">
          <tr>
            <Th>동아리명</Th>
            <Th>중앙동아리</Th>
            <Th>최근 인증 연도</Th>
            <Th>만료 여부</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.clubId} className="border-t border-line hover:bg-graysoft/50">
              <Td>
                {item.clubName}
                <span className="ml-1 text-charcoal-3 text-[11px]">(ID: {item.clubId})</span>
              </Td>
              <Td>
                <span
                  className={cn(
                    'inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold',
                    item.centralClub
                      ? 'bg-sky-100 text-sky-800'
                      : 'bg-zinc-100 text-zinc-600',
                  )}
                >
                  {item.centralClub ? '중앙동아리' : '일반'}
                </span>
              </Td>
              <Td>
                {item.lastVerifiedYear !== null ? `${item.lastVerifiedYear}년` : '—'}
              </Td>
              <Td>
                <span
                  className={cn(
                    'inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold',
                    item.expired
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-emerald-100 text-emerald-800',
                  )}
                >
                  {item.expired ? '만료' : '유효'}
                </span>
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
