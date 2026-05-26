'use client';

type Props = {
  clubName: string | null;
  currentValue: boolean;
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AdminClubCentralClubToggleDialog({
  clubName,
  currentValue,
  isPending,
  errorMessage,
  onConfirm,
  onCancel,
}: Props) {
  if (clubName === null) return null;
  const action = currentValue ? '해제' : '지정';
  return (
    <div
      role="alertdialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
    >
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <header>
          <h2 className="text-base font-semibold text-slate-900">중앙동아리 {action}</h2>
        </header>
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-800">{clubName}</span> 을(를) 중앙동아리로{' '}
          {action}하시겠습니까?
        </p>
        {errorMessage && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? '처리 중…' : '확인'}
          </button>
        </div>
      </div>
    </div>
  );
}
