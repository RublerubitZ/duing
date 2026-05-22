'use client';

type Props = {
  roundLabel: string | null;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AdminRecertificationRoundCloseDialog({ roundLabel, isPending, onConfirm, onCancel }: Props) {
  if (!roundLabel) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40">
      <div className="rounded-2xl bg-paper p-6 max-w-sm w-full">
        <h2 className="text-[15px] font-bold text-ink">라운드를 종료할까요?</h2>
        <p className="mt-2 text-[13px] text-charcoal-2">
          &quot;{roundLabel}&quot; 라운드를 종료하면 더 이상 재인증 제출을 받을 수 없습니다.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md border border-line text-[13px] text-charcoal-2"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="px-3 py-1.5 rounded-md bg-coral text-paper text-[13px] font-semibold disabled:opacity-50"
          >
            {isPending ? '종료 중…' : '종료'}
          </button>
        </div>
      </div>
    </div>
  );
}
