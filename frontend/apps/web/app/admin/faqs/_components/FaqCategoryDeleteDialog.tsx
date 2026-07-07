'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type CategoryOption = { id: number; name: string };

type FaqCategoryDeleteDialogProps = {
  category: CategoryOption;
  otherCategories: CategoryOption[];
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: (moveToCategoryId: number | null) => void;
  onCancel: () => void;
};

// 카테고리 삭제 확인 + FAQ 이관 대상 선택 다이얼로그. 빈 카테고리는 기본 선택("이관하지 않고 삭제")
// 만으로 충분하지만, FAQ 를 보유한 카테고리는 서버가 moveToCategoryId 없이는 409 로 거절하므로
// 이관 대상을 고를 수 있게 한다(기본 선택은 항상 "이관하지 않고 삭제").
export function FaqCategoryDeleteDialog({
  category,
  otherCategories,
  isPending,
  errorMessage,
  onConfirm,
  onCancel,
}: FaqCategoryDeleteDialogProps) {
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);

  // 선택해둔 이관 대상이 목록에서 사라지면(다른 세션의 삭제 등으로 categories 쿼리 갱신)
  // 기본 선택으로 되돌려, 화면에 보이지 않는 대상 id 가 전송되는 것을 방지한다.
  useEffect(() => {
    if (selectedTargetId !== null && !otherCategories.some((category) => category.id === selectedTargetId)) {
      setSelectedTargetId(null);
    }
  }, [otherCategories, selectedTargetId]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <DialogContent
        className="max-w-sm"
        // 파괴적 다이얼로그는 외부 클릭으로 dismiss 하지 않는다(admin 파괴 다이얼로그 공통 관례) —
        // 닫기는 명시 취소 버튼/ESC 로만.
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>카테고리를 삭제할까요?</DialogTitle>
          <DialogDescription>{`'${category.name}' 카테고리를 삭제합니다.`}</DialogDescription>
        </DialogHeader>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-charcoal-2">FAQ 처리 방법</legend>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-line px-3 py-2 transition-colors hover:bg-sage-tint">
              <input
                type="radio"
                name="faq-category-delete-target"
                checked={selectedTargetId === null}
                onChange={() => setSelectedTargetId(null)}
                className="accent-ink"
              />
              <span className="text-sm text-charcoal">이관하지 않고 삭제</span>
            </label>

            {otherCategories.map((otherCategory) => (
              <label
                key={otherCategory.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-line px-3 py-2 transition-colors hover:bg-sage-tint"
              >
                <input
                  type="radio"
                  name="faq-category-delete-target"
                  checked={selectedTargetId === otherCategory.id}
                  onChange={() => setSelectedTargetId(otherCategory.id)}
                  className="accent-ink"
                />
                <span className="text-sm text-charcoal">{`'${otherCategory.name}'(으)로 FAQ 이관 후 삭제`}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {errorMessage && (
          <p role="alert" className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">
            {errorMessage}
          </p>
        )}

        <DialogFooter>
          <button type="button" onClick={onCancel} disabled={isPending} className="btn btn-ghost btn-sm">
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedTargetId)}
            disabled={isPending}
            className="btn btn-sm bg-coral text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50"
          >
            {isPending ? '삭제 중…' : '삭제'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
