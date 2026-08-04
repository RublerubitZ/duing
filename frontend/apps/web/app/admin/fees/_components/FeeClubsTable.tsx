'use client';

import Link from 'next/link';

import { formatDateKst } from '@duing/hooks/datetime';
import type { AdminFeeClubSummary } from '@duing/types';

import { toRoute } from '@/app/_lib/route';
import { EmptyState } from '../../_components/EmptyState';
import { formatFeeAmount } from '../_lib/feeAuditLabels';

type Props = {
  items: AdminFeeClubSummary[];
  onOpenDetail: (club: AdminFeeClubSummary) => void;
};

export function FeeClubsTable({ items, onOpenDetail }: Props) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="🔎"
        title="조회 결과가 없습니다"
        body={'검색어를 줄이거나 기간·사용 여부 필터를 바꿔보세요.\n동아리명으로 찾을 수 있어요.'}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-[13px]">
        <colgroup>
          <col />
          <col className="w-[68px]" />
          <col className="w-[68px]" />
          <col className="w-[76px]" />
          <col className="w-[112px]" />
          <col className="w-[112px]" />
          <col className="w-[112px]" />
          <col className="w-[76px]" />
          <col className="w-[112px]" />
        </colgroup>
        <thead className="bg-graysoft text-charcoal-2">
          <tr>
            <Th>동아리</Th>
            <Th align="right">정책</Th>
            <Th align="right">회원</Th>
            <Th align="right">청구 건수</Th>
            <Th align="right">청구액</Th>
            <Th align="right">수납액</Th>
            <Th align="right">미수금</Th>
            <Th align="right">미납 인원</Th>
            <Th>최근 납부</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((club) => {
            // 회비를 쓰지 않는 동아리는 0 이 아니라 "해당 없음"이다 — 0 으로 적으면 미수금 0 원과 구분되지 않는다.
            const unused = !club.feeUsing;
            return (
              <tr
                key={club.clubId}
                onClick={() => onOpenDetail(club)}
                className={`cursor-pointer border-t border-line hover:bg-graysoft/50 ${
                  unused ? 'opacity-60' : ''
                }`}
              >
                <Td>
                  <div className="flex min-w-0 items-center gap-2">
                    {/* 행 전체가 클릭 대상이지만 키보드·새 탭으로도 들어갈 수 있어야 해서 이름은 링크로 둔다.
                        링크 자체가 이동을 처리하므로 행 핸들러까지 타지 않게 전파를 끊는다. */}
                    <Link
                      href={toRoute(`/admin/fees/${club.clubId}`)}
                      onClick={(event) => event.stopPropagation()}
                      className="truncate text-[13.5px] font-semibold text-charcoal hover:underline"
                    >
                      {club.clubName}
                    </Link>
                    {/* 알려진 비활성 상태에만 배지를 단다 — `!== 'ACTIVE'` 로 가르면 배포 전환기에 전원이 비활성으로 보인다. */}
                    {club.clubStatus === 'INACTIVE' && (
                      <span className="pill-outline shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold">
                        비활성
                      </span>
                    )}
                  </div>
                </Td>
                <Td align="right">{unused ? '—' : club.activePolicyCount}</Td>
                <Td align="right">{club.memberCount}</Td>
                <Td align="right">{unused ? '—' : club.billCount}</Td>
                <Td align="right">{unused ? '—' : formatFeeAmount(club.totalBilled)}</Td>
                <Td align="right">{unused ? '—' : formatFeeAmount(club.totalPaid)}</Td>
                <Td align="right">
                  {unused ? (
                    '—'
                  ) : (
                    <span className={club.outstanding > 0 ? 'font-semibold text-danger' : undefined}>
                      {formatFeeAmount(club.outstanding)}
                    </span>
                  )}
                </Td>
                <Td align="right">{unused ? '—' : club.unpaidMemberCount}</Td>
                <Td>
                  <span className="whitespace-nowrap text-charcoal-3">
                    {club.lastPaidAt === null ? '—' : formatDateKst(club.lastPaidAt)}
                  </span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const Th = ({ children, align }: { children: React.ReactNode; align?: 'right' }) => (
  <th className={`px-3 py-2 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
);
const Td = ({ children, align }: { children: React.ReactNode; align?: 'right' }) => (
  <td
    className={`px-3 py-2 align-middle ${align === 'right' ? 'text-right tabular-nums' : ''}`}
  >
    {children}
  </td>
);
