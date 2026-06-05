'use client';

type Props = {
  title: string | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function AdminGlobalEventDeleteDialog({ title, isPending, onCancel, onConfirm }: Props) {
  if (!title) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[420px] rounded-2xl bg-paper p-6">
        <h2 className="text-[16px] font-bold text-ink mb-2">이벤트 삭제</h2>
        <p className="text-[13.5px] text-charcoal-2 mb-6">
          &quot;<strong className="text-ink">{title}</strong>&quot; 를 삭제하시겠어요? 캘린더에서 즉시 사라집니다.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 rounded-full border border-line text-[13px]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 rounded-full bg-coral text-paper text-[13px] font-semibold disabled:opacity-60"
          >
            {isPending ? '삭제 중…' : '삭제'}
          </button>
        </div>
      </div>
    </div>
  );
}
