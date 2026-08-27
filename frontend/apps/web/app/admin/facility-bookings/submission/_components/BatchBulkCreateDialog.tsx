'use client';

import { useState } from 'react';
import { ButtonSpinner } from '@/components/loading/Spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { defaultBatchMemo } from '../_lib/submissionBatches';

export type BulkCreateClubGroup = { clubId: number; clubName: string; bookingIds: number[] };

type Props = {
  groups: BulkCreateClubGroup[];
  isPending: boolean;
  onClose: () => void;
  onConfirm: (groups: BulkCreateClubGroup[], memoByClubId: ReadonlyMap<number, string>) => void;
};

/**
 * 일괄 생성 확인(v2 스펙 §4) — 배치=동아리 단위 제약(BE MixedClubException)을 동아리별 분해 행으로
 * 드러내고, 메모를 "M월 N주차 · 동아리명"으로 프리필한다. 조건부 마운트라 열릴 때 스냅샷·프리필이 초기화된다.
 */
export function BatchBulkCreateDialog({ groups, isPending, onClose, onConfirm }: Props) {
  // 제출 중 재조회로 부모 파생 그룹이 줄어도 화면·확정 대상이 흔들리지 않게 오픈 시점 스냅샷을 쓴다.
  const [groupsSnapshot] = useState(groups);
  const [memoByClubId, setMemoByClubId] = useState<ReadonlyMap<number, string>>(
    () => new Map(groupsSnapshot.map((group) => [group.clubId, defaultBatchMemo(group.clubName)])),
  );

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isPending) onClose();
      }}
    >
      <DialogContent busy={isPending} className="w-[calc(100%-2rem)] max-w-md rounded-[22px]">
        <DialogHeader>
          <DialogTitle className="text-[21px] font-extrabold leading-snug text-ink-deep">
            {groupsSnapshot.length > 1 ? `제출 목록 ${groupsSnapshot.length}개를 만들까요?` : '제출 목록을 만들까요?'}
          </DialogTitle>
          <DialogDescription>
            배치는 동아리 단위로 만들어져요. 학교 행정실 제출을 마친 뒤 &apos;제출 대기&apos; 탭에서 &apos;제출
            완료&apos; 처리를 해주세요.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {groupsSnapshot.map((group) => (
            <li key={group.clubId} className="rounded-md border border-line px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink-deep">{group.clubName}</span>
                <span className="text-xs tabular-nums text-charcoal-3">{group.bookingIds.length}건</span>
              </div>
              <input
                aria-label={`${group.clubName} 메모`}
                value={memoByClubId.get(group.clubId) ?? ''}
                maxLength={500}
                onChange={(event) =>
                  setMemoByClubId((previous) => new Map(previous).set(group.clubId, event.target.value))
                }
                className="mt-1.5 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-sm"
              />
            </li>
          ))}
        </ul>
        <p className="text-xs text-charcoal-3">메모는 목록 이름처럼 표시돼요 — 알아보기 쉽게 남겨주세요.</p>
        <DialogFooter>
          <button type="button" className="btn btn-ghost btn-sm" disabled={isPending} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={isPending}
            onClick={() => onConfirm(groupsSnapshot, memoByClubId)}
          >
            {isPending && <ButtonSpinner />}
            목록 만들기
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
