'use client';

import { useEffect, useId, useRef } from 'react';

// Spec P0-4 — 운영진 list 의 "면접 대상으로 선정" 확정 모달.
// 본문은 spec 의 wording 을 글자 단위로 따른다:
//   {대표 이름} 외 {N-1}명을
//   면접 대상자로 선정하시겠습니까?
//   <빈 줄>
//   선정된 지원자는 자동배정 대상에 포함됩니다.
//
// 대표 이름은 선택된 지원자 중 첫 번째 (page.tsx 가 정렬 보장된 list 의 첫 번째를
// 그대로 전달). 1명일 때는 "외 0명" 으로 출력해도 의미가 어색하지 않다는 spec 판단
// (선택 0건일 때는 BulkActionBar 자체가 비활성이므로 호출되지 않음).
//
// representativeName 이 빈 문자열일 때 — selection 후 filter/search 가 바뀌어
// 선택된 지원자가 현재 visible list 에서 사라진 경우 — 대표 이름 대신
// "선택한 N명을" 으로 fallback 하여 빈 이름이 노출되지 않도록 한다.
//
// ESC / backdrop click 으로 취소, 진입 시 "선정" 버튼 autofocus.

type Props = {
  representativeName: string;
  selectedCount: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function BulkPromoteDialog({
  representativeName,
  selectedCount,
  isPending,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const descId = useId();
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  // ESC 닫기 (모달이 열려 있는 동안만 등록).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (!isPending) onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPending, onCancel]);

  // 진입 시 "선정" 버튼으로 autofocus — 키보드 사용자가 바로 Enter 가능.
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  const othersCount = Math.max(selectedCount - 1, 0);
  const summaryLine = representativeName
    ? `${representativeName} 외 ${othersCount}명을`
    : `선택한 ${selectedCount}명을`;

  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={() => {
        if (!isPending) onCancel();
      }}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-semibold text-slate-900">
          면접 대상자 선정
        </h2>
        <div id={descId} className="space-y-3 text-sm text-slate-700">
          <p className="whitespace-pre-line text-slate-900">
            {summaryLine}
            {'\n'}
            면접 대상자로 선정하시겠습니까?
          </p>
          <p className="text-slate-600">선정된 지원자는 자동배정 대상에 포함됩니다.</p>
        </div>
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
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {isPending ? '처리 중…' : '선정'}
          </button>
        </div>
      </div>
    </div>
  );
}
