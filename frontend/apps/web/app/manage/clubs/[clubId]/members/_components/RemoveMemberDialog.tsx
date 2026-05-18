'use client';

type RemoveMemberDialogProps = {
  targetName: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function RemoveMemberDialog({ targetName, isPending, onConfirm, onCancel }: RemoveMemberDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-slate-900">멤버 강퇴</h2>
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-900">{targetName}</span> 님을 동아리에서 강퇴할까요?
          되돌릴 수 없으며, 진행 중인 지원서는 그대로 유지됩니다.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {isPending ? '처리 중…' : '강퇴'}
          </button>
        </div>
      </div>
    </div>
  );
}
