'use client';

type Props = {
  title: string | null;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AdminPromotionDeleteDialog({ title, isPending, onConfirm, onCancel }: Props) {
  if (!title) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40">
      <div className="rounded-2xl bg-paper p-6 max-w-sm w-full">
        <h2 className="text-[15px] font-bold text-ink">배너를 삭제할까요?</h2>
        <p className="mt-2 text-[13px] text-charcoal-2">
          &quot;{title}&quot; 배너가 더 이상 노출되지 않습니다.
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
            {isPending ? '삭제 중…' : '삭제'}
          </button>
        </div>
      </div>
    </div>
  );
}
