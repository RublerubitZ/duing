'use client';

import { useEffect, useRef } from 'react';
import type { JoinRequestSummary } from '@duing/types';
import { formatDateKst } from '@duing/hooks';
import { cn } from '@/app/_lib/cn';

type JoinRequestTableProps = {
  requests: JoinRequestSummary[];
  // 선택·일괄 승인은 대기 중일 때만 의미가 있다 — 처리된 요청은 읽기 전용 목록으로 렌더한다.
  selectable: boolean;
  selectedIds: ReadonlySet<number>;
  onToggleSelect: (joinRequestId: number) => void;
  onToggleAll: () => void;
  onOpenDetail: (joinRequestId: number) => void;
  emptyMessage: string;
};

export function JoinRequestTable({
  requests,
  selectable,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onOpenDetail,
  emptyMessage,
}: JoinRequestTableProps) {
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // 기수는 코드에 붙는 스냅샷이라, 기수를 쓰지 않는 동아리는 전 행이 null 이 된다 —
  // 동아리 설정을 따로 조회하지 않고 데이터만으로 열 노출을 판단한다.
  const showGeneration = requests.some((each) => each.generation !== null);

  const allSelected =
    requests.length > 0 && requests.every((each) => selectedIds.has(each.joinRequestId));
  const someSelected = requests.some((each) => selectedIds.has(each.joinRequestId));

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  if (requests.length === 0) {
    return (
      <div className="card px-6 py-12 text-center">
        <p className="text-sm font-medium text-charcoal-2">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-cream text-left">
          <tr>
            {selectable && (
              <th className="w-10 px-4 py-3">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  aria-label="전체 선택"
                  checked={allSelected}
                  onChange={onToggleAll}
                  className="h-4 w-4 cursor-pointer rounded border-line text-ink focus:ring-sage"
                />
              </th>
            )}
            <th className="px-4 py-3 font-medium text-charcoal-2">이름</th>
            <th className="px-4 py-3 font-medium text-charcoal-2">학번</th>
            <th className="px-4 py-3 font-medium text-charcoal-2">학과</th>
            <th className="px-4 py-3 font-medium text-charcoal-2">코드</th>
            {showGeneration && <th className="px-4 py-3 font-medium text-charcoal-2">기수</th>}
            <th className="px-4 py-3 font-medium text-charcoal-2">요청일</th>
            <th className="px-4 py-3 text-right font-medium text-charcoal-2">상세</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {requests.map((joinRequest) => {
            const isSelected = selectedIds.has(joinRequest.joinRequestId);
            return (
              <tr
                key={joinRequest.joinRequestId}
                onClick={() => onOpenDetail(joinRequest.joinRequestId)}
                className={cn('cursor-pointer hover:bg-cream/60', isSelected && 'bg-cream/60')}
              >
                {selectable && (
                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`${joinRequest.userName} 선택`}
                      checked={isSelected}
                      onChange={() => onToggleSelect(joinRequest.joinRequestId)}
                      className="h-4 w-4 cursor-pointer rounded border-line text-ink focus:ring-sage"
                    />
                  </td>
                )}
                <td className="px-4 py-3 font-medium text-ink-deep">
                  {joinRequest.userName}
                  {/* 운영진 손을 거치지 않고 승인된 요청이라, 표시가 없으면 승인 경위를 알 길이 없다. */}
                  {joinRequest.autoApproved && (
                    <span className="ml-1.5 rounded-full bg-sage-mist px-2 py-0.5 text-xs font-medium text-ink">
                      자동 승인
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-xs text-charcoal-2">{joinRequest.studentId}</td>
                <td className="px-4 py-3 text-charcoal-2">{joinRequest.major}</td>
                <td className="px-4 py-3 tabular-nums text-xs text-charcoal-2">{joinRequest.code}</td>
                {showGeneration && (
                  <td className="px-4 py-3 text-charcoal-2">
                    {joinRequest.generation === null ? '—' : `${joinRequest.generation}기`}
                  </td>
                )}
                <td className="px-4 py-3 tabular-nums text-xs text-charcoal-2">
                  {formatDateKst(joinRequest.requestedAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  {/* 행 onClick 은 포인터 편의용일 뿐 — 키보드·스크린리더가 상세에 닿는 통로는 이 버튼이다. */}
                  <button
                    type="button"
                    aria-label={`${joinRequest.userName} 상세`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDetail(joinRequest.joinRequestId);
                    }}
                    className="btn btn-ghost btn-sm"
                  >
                    상세
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
