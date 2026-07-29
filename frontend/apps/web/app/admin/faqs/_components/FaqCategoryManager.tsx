'use client';

import { useState } from 'react';
import {
  useFederationFaqCategoriesQuery,
  useAdminFederationFaqCategoryCreateMutation,
  useAdminFederationFaqCategoryUpdateMutation,
  useAdminFederationFaqCategoryDeleteMutation,
} from '@duing/hooks';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { FaqCategoryDeleteDialog } from './FaqCategoryDeleteDialog';

// 카테고리 관리 카드 — 목록 상단 접이식. 이름 인라인 수정 + 순서 위/아래(인접 sortOrder 교환,
// update 2회 순차 호출) + 신규 생성 + 삭제(빈 카테고리는 즉시, FAQ 보유 시 이관 대상 선택).
export function FaqCategoryManager() {
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newName, setNewName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  const categoriesQuery = useFederationFaqCategoriesQuery();
  const createMutation = useAdminFederationFaqCategoryCreateMutation();
  const updateMutation = useAdminFederationFaqCategoryUpdateMutation();
  const deleteMutation = useAdminFederationFaqCategoryDeleteMutation();

  const categories = categoriesQuery.data ?? [];

  const startEdit = (categoryId: number, name: string) => {
    setErrorMessage(null);
    setEditingId(categoryId);
    setEditingName(name);
  };

  const saveEdit = (categoryId: number, sortOrder: number) => {
    const trimmed = editingName.trim();
    if (trimmed === '') return;
    setErrorMessage(null);
    updateMutation.mutate(
      { categoryId, payload: { name: trimmed, sortOrder } },
      {
        onSuccess: () => setEditingId(null),
        onError: (error) => setErrorMessage(extractErrorMessage(error) ?? '카테고리 수정에 실패했습니다.'),
      },
    );
  };

  const moveCategory = (index: number, direction: 'up' | 'down') => {
    // 스왑은 update 2회로 이뤄져 원자적이지 않다 — 진행 중 연속 클릭이 stale 순서 기반 요청을
    // 겹쳐 보내지 않도록 pending 동안 차단한다(버튼 disabled 와 이중 방어).
    if (updateMutation.isPending) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;
    const current = categories[index];
    const target = categories[targetIndex];
    if (!current || !target) return;

    setErrorMessage(null);
    // 인접 카테고리와 sortOrder 를 교환한다 — update 를 순차 호출(첫 호출 성공 후 두 번째 호출).
    updateMutation.mutate(
      { categoryId: current.id, payload: { name: current.name, sortOrder: target.sortOrder } },
      {
        onSuccess: () => {
          updateMutation.mutate(
            { categoryId: target.id, payload: { name: target.name, sortOrder: current.sortOrder } },
            {
              onError: (error) => setErrorMessage(extractErrorMessage(error) ?? '순서 변경에 실패했습니다.'),
            },
          );
        },
        onError: (error) => setErrorMessage(extractErrorMessage(error) ?? '순서 변경에 실패했습니다.'),
      },
    );
  };

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (trimmed === '') return;
    setErrorMessage(null);
    createMutation.mutate(
      { name: trimmed },
      {
        onSuccess: () => setNewName(''),
        onError: (error) => setErrorMessage(extractErrorMessage(error) ?? '카테고리 생성에 실패했습니다.'),
      },
    );
  };

  const handleDeleteConfirm = (moveToCategoryId: number | null) => {
    if (!deleteTarget) return;
    // 진행 중 재클릭이 중복 삭제 요청을 겹쳐 보내지 않도록 차단(버튼 disabled 와 이중 방어).
    if (deleteMutation.isPending) return;
    setDeleteErrorMessage(null);
    deleteMutation.mutate(
      { categoryId: deleteTarget.id, moveToCategoryId: moveToCategoryId ?? undefined },
      {
        onSuccess: () => {
          setDeleteTarget(null);
          setDeleteErrorMessage(null);
        },
        onError: (error) =>
          setDeleteErrorMessage(extractErrorMessage(error) ?? '카테고리 삭제에 실패했습니다.'),
      },
    );
  };

  return (
    <div className="rounded-xl border border-line bg-paper">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-[13.5px] font-semibold text-ink"
      >
        카테고리 관리
        <span className="text-[12px] font-normal text-charcoal-3">{expanded ? '접기' : '펼치기'}</span>
      </button>

      {expanded && (
        <div className="space-y-3 px-4 py-4">
          {categoriesQuery.isLoading && (
            <LoadingGate className="min-h-0 py-4" label="카테고리 목록 불러오는 중" />
          )}
          {categoriesQuery.isSuccess && categories.length === 0 && (
            <p className="text-[12.5px] text-charcoal-3">등록된 카테고리가 없습니다.</p>
          )}

          {categories.map((category, index) => (
            <div key={category.id} className="flex items-center gap-2">
              {editingId === category.id ? (
                <input
                  type="text"
                  value={editingName}
                  maxLength={50}
                  onChange={(event) => setEditingName(event.target.value)}
                  className="flex-1 rounded-md border border-line bg-paper px-2.5 py-1.5 text-[13px]"
                />
              ) : (
                <span className="flex-1 text-[13px] text-charcoal">{category.name}</span>
              )}

              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => moveCategory(index, 'up')}
                  disabled={index === 0 || updateMutation.isPending}
                  aria-label="카테고리 위로 이동"
                  className="grid h-7 w-7 place-items-center rounded text-charcoal-2 hover:bg-graysoft disabled:opacity-30"
                >▲</button>
                <button
                  type="button"
                  onClick={() => moveCategory(index, 'down')}
                  disabled={index === categories.length - 1 || updateMutation.isPending}
                  aria-label="카테고리 아래로 이동"
                  className="grid h-7 w-7 place-items-center rounded text-charcoal-2 hover:bg-graysoft disabled:opacity-30"
                >▼</button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteErrorMessage(null);
                    setDeleteTarget({ id: category.id, name: category.name });
                  }}
                  disabled={updateMutation.isPending || deleteMutation.isPending}
                  aria-label={`'${category.name}' 카테고리 삭제`}
                  className="grid h-7 w-7 place-items-center rounded text-coral hover:bg-coral/10 disabled:opacity-30"
                >×</button>
              </div>

              {editingId === category.id ? (
                <button
                  type="button"
                  onClick={() => saveEdit(category.id, category.sortOrder)}
                  className="text-[12px] font-semibold text-ink hover:underline"
                >저장</button>
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(category.id, category.name)}
                  className="text-[12px] text-charcoal-2 hover:text-ink"
                >수정</button>
              )}
            </div>
          ))}

          {errorMessage && <p className="text-[12.5px] text-coral">{errorMessage}</p>}

          <div className="flex gap-2 pt-3">
            <input
              type="text"
              value={newName}
              maxLength={50}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="새 카테고리 이름"
              className="flex-1 rounded-md border border-line bg-paper px-2.5 py-1.5 text-[13px]"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={createMutation.isPending || newName.trim() === ''}
              className="rounded-md bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-paper disabled:opacity-50"
            >추가</button>
          </div>
        </div>
      )}

      {deleteTarget && (
        <FaqCategoryDeleteDialog
          // 언마운트 없이 대상만 교체될 경우 선택 상태가 이월되지 않도록 대상별로 리마운트한다
          // (현재 흐름상 도달 불가하지만 방어).
          key={deleteTarget.id}
          category={deleteTarget}
          otherCategories={categories
            .filter((category) => category.id !== deleteTarget.id)
            .map((category) => ({ id: category.id, name: category.name }))}
          isPending={deleteMutation.isPending}
          errorMessage={deleteErrorMessage}
          onConfirm={handleDeleteConfirm}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteErrorMessage(null);
          }}
        />
      )}
    </div>
  );
}
