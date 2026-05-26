'use client';

import { useState } from 'react';
import type { AdminRecertificationRound } from '@duing/types';
import { useCloseRecertificationRoundMutation } from '@duing/hooks';
import { cn } from '../../../../_lib/cn';
import { ROUND_STATUS_LABEL, ROUND_STATUS_BADGE_CLASS } from '../_lib/recertificationRoundLabels';
import { AdminRecertificationRoundCloseDialog } from './AdminRecertificationRoundCloseDialog';

type Props = {
  items: AdminRecertificationRound[];
};

export function AdminRecertificationRoundsTable({ items }: Props) {
  const [closingRound, setClosingRound] = useState<AdminRecertificationRound | null>(null);
  const closeMutation = useCloseRecertificationRoundMutation();

  const handleCloseConfirm = () => {
    if (!closingRound) return;
    closeMutation.mutate(closingRound.id, {
      onSuccess: () => setClosingRound(null),
    });
  };

  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-charcoal-3 text-[13px]">
        조건에 맞는 라운드가 없습니다.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-graysoft text-charcoal-2">
            <tr>
              <Th>상태</Th>
              <Th>연도</Th>
              <Th>라벨</Th>
              <Th>개설자</Th>
              <Th>개설 일시</Th>
              <Th>종료자</Th>
              <Th>종료 일시</Th>
              <Th>액션</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((round) => (
              <tr key={round.id} className="border-t border-line hover:bg-graysoft/50">
                <Td>
                  <span
                    className={cn(
                      'inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold',
                      ROUND_STATUS_BADGE_CLASS[round.status],
                    )}
                  >
                    {ROUND_STATUS_LABEL[round.status]}
                  </span>
                </Td>
                <Td>{round.year}</Td>
                <Td>{round.label}</Td>
                <Td>{round.openedBy.name}</Td>
                <Td>{new Date(round.openedAt).toLocaleString('ko-KR')}</Td>
                <Td>{round.closedBy?.name ?? '—'}</Td>
                <Td>
                  {round.closedAt ? new Date(round.closedAt).toLocaleString('ko-KR') : '—'}
                </Td>
                <Td>
                  {round.status === 'OPEN' && (
                    <button
                      type="button"
                      onClick={() => setClosingRound(round)}
                      className="text-[12px] text-coral hover:underline"
                    >
                      종료
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AdminRecertificationRoundCloseDialog
        roundLabel={closingRound?.label ?? null}
        isPending={closeMutation.isPending}
        onConfirm={handleCloseConfirm}
        onCancel={() => setClosingRound(null)}
      />
    </>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left px-3 py-2 font-semibold">{children}</th>
);
const Td = ({ children }: { children: React.ReactNode }) => (
  <td className="px-3 py-2 align-middle">{children}</td>
);
