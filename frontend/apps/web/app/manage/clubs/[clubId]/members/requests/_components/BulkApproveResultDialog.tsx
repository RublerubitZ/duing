'use client';

import type { BulkApproveResult } from '@duing/types';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type BulkApproveResultDialogProps = {
  result: BulkApproveResult;
  // 실패 사유를 누구 것인지 알아볼 수 있게 이름을 붙인다 — 응답은 id 만 준다.
  // 제출 시점 스냅샷이라 갱신으로 목록에서 빠진 요청도 이름이 남는다.
  names: ReadonlyMap<number, string>;
  onClose: () => void;
};

/**
 * 일괄 승인은 건별 트랜잭션이라 "일부 성공 + 일부 실패" 가 정상 결과다.
 * 실패 사유는 상황마다 다른 서버 문구(잔여 인원 부족·이미 처리됨·자동 거절 등)이므로 그대로 보여준다.
 */
export function BulkApproveResultDialog({
  result,
  names,
  onClose,
}: BulkApproveResultDialogProps) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>일괄 승인 결과</DialogTitle>
          <DialogDescription>
            {result.approvedCount}건을 승인했고, {result.failures.length}건은 처리하지 못했습니다.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-60 space-y-2 overflow-y-auto">
          {result.failures.map((failure) => (
            <li
              key={failure.joinRequestId}
              className="rounded-md border border-line bg-graysoft/40 px-3 py-2"
            >
              <p className="text-sm font-medium text-charcoal">
                {names.get(failure.joinRequestId) ?? `요청 ${failure.joinRequestId}`}
              </p>
              <p className="text-xs text-coral">{failure.reason}</p>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <button type="button" onClick={onClose} className="btn btn-primary btn-sm">
            확인
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
