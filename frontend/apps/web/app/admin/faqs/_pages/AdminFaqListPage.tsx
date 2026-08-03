'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AdminFederationFaqSummary } from '@duing/types';
import {
  formatDateKst,
  useFederationFaqCategoriesQuery,
  useAdminFederationFaqListQuery,
  useAdminFederationFaqUpdateMutation,
  useAdminFederationFaqDeleteMutation,
  useAdminFederationFaqReorderMutation,
} from '@duing/hooks';
import { Pagination } from '@/components/Pagination';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { cn } from '@/app/_lib/cn';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { toRoute } from '../../../_lib/route';
import { FaqCategoryManager } from '../_components/FaqCategoryManager';
import { FaqSearchMissPanel } from '../_components/FaqSearchMissPanel';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';
import { FAQ_FULL_LIST_SIZE } from '../_lib/faqListConstants';

const PAGE_SIZE = 20;

type PublishedFilter = 'ALL' | 'PUBLISHED' | 'UNPUBLISHED';

const PUBLISHED_OPTIONS: { value: PublishedFilter; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'PUBLISHED', label: '공개' },
  { value: 'UNPUBLISHED', label: '비공개' },
];

function toPublishedParam(filter: PublishedFilter): boolean | undefined {
  if (filter === 'PUBLISHED') return true;
  if (filter === 'UNPUBLISHED') return false;
  return undefined;
}

const FILTER_DISABLED_TITLE = '필터를 해제하면 순서를 바꿀 수 있어요';

export function AdminFaqListPage() {
  const [publishedFilter, setPublishedFilter] = useState<PublishedFilter>('ALL');
  const [categoryId, setCategoryId] = useState<number | 'ALL'>('ALL');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; question: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // 삭제는 확인 모달 흐름이라 오류를 모달 안에서 보여준다(공통 규칙). 나머지 액션은 기존대로 목록 위.
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filtersActive = publishedFilter !== 'ALL' || categoryId !== 'ALL' || keyword !== '';

  const categoriesQuery = useFederationFaqCategoriesQuery();
  const listQuery = useAdminFederationFaqListQuery({
    published: toPublishedParam(publishedFilter),
    categoryId: categoryId !== 'ALL' ? categoryId : undefined,
    keyword: keyword || undefined,
    page,
    size: PAGE_SIZE,
  });
  // 순서 이동은 필터가 없을 때만 허용된다 — 현재 페이지(20건)는 전체 순서의 부분집합이라
  // 인접 스왑 계산에 재사용할 수 없으므로, 필터 미적용 시에만 활성화되는 별도 전체 목록 쿼리로
  // orderedIds 를 구성한다.
  const fullListQuery = useAdminFederationFaqListQuery(
    { page: 0, size: FAQ_FULL_LIST_SIZE },
    !filtersActive,
  );

  const updateMutation = useAdminFederationFaqUpdateMutation();
  const deleteMutation = useAdminFederationFaqDeleteMutation();
  const reorderMutation = useAdminFederationFaqReorderMutation();

  const items = listQuery.data?.content ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;
  const fullItems = fullListQuery.data?.content ?? [];
  // size 500 창이 전체를 못 담으면(501개 이상) 부분 집합으로 reorder PUT 을 보내 서버의
  // 전체 id 집합 검증(400)에 걸리므로, 전체가 확보되지 않은 동안은 이동을 잠근다.
  // reorder 진행 중에도 잠가 stale 순서 기반 요청이 겹치는 것을 막는다.
  const fullListIncomplete = (fullListQuery.data?.totalElements ?? 0) > fullItems.length;
  const reorderLocked = filtersActive || fullListIncomplete || reorderMutation.isPending;

  const resetToFirstPage = () => setPage(0);

  const handleToggleField = (faq: AdminFederationFaqSummary, field: 'pinned' | 'published') => {
    setActionError(null);
    updateMutation.mutate(
      {
        faqId: faq.id,
        payload: {
          categoryId: faq.categoryId,
          question: faq.question,
          answer: faq.answer,
          pinned: field === 'pinned' ? !faq.pinned : faq.pinned,
          published: field === 'published' ? !faq.published : faq.published,
        },
      },
      {
        onError: (error) => setActionError(extractErrorMessage(error) ?? '변경에 실패했습니다.'),
      },
    );
  };

  const handleMove = (faqId: number, direction: 'up' | 'down') => {
    if (reorderLocked) return;
    const index = fullItems.findIndex((item) => item.id === faqId);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= fullItems.length) return;

    setActionError(null);
    const orderedIds = fullItems.map((item) => item.id);
    const current = orderedIds[index];
    const swapped = orderedIds[targetIndex];
    if (current === undefined || swapped === undefined) return;
    orderedIds[index] = swapped;
    orderedIds[targetIndex] = current;

    reorderMutation.mutate(orderedIds, {
      onError: (error) => setActionError(extractErrorMessage(error) ?? '순서 변경에 실패했습니다.'),
    });
  };

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-ink">FAQ 관리</h1>
          <p className="mt-1 text-[13.5px] text-charcoal-2">총동연 자주 묻는 질문을 작성·정렬·공개 관리합니다.</p>
        </div>
        <Link
          href="/admin/faqs/new"
          className="px-4 py-2 rounded-full bg-ink text-paper text-[13.5px] font-semibold"
        >+ 새 FAQ</Link>
      </header>

      <div className="mb-5">
        <FaqCategoryManager />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {PUBLISHED_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => { setPublishedFilter(option.value); resetToFirstPage(); }}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-[13px] font-semibold',
                publishedFilter === option.value
                  ? 'border-ink bg-ink text-paper'
                  : 'border-line bg-paper text-charcoal-2',
              )}
            >{option.label}</button>
          ))}
        </div>

        <select
          value={categoryId === 'ALL' ? 'ALL' : String(categoryId)}
          onChange={(event) => {
            const next = event.target.value;
            setCategoryId(next === 'ALL' ? 'ALL' : Number(next));
            resetToFirstPage();
          }}
          className="px-3 py-1.5 rounded-md border border-line bg-paper text-[13px]"
        >
          <option value="ALL">전체 카테고리</option>
          {(categoriesQuery.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>

        <form
          onSubmit={(event) => { event.preventDefault(); setKeyword(keywordInput); resetToFirstPage(); }}
          className="flex gap-2"
        >
          <input
            type="search"
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            placeholder="질문 검색"
            className="px-3 py-1.5 rounded-md border border-line bg-paper text-[13px]"
          />
          <button type="submit" className="px-3 py-1.5 rounded-md bg-ink text-paper text-[13px] font-semibold">검색</button>
        </form>
      </div>

      <div className="mb-5">
        <FaqSearchMissPanel />
      </div>

      {actionError && <p className="mb-4 text-[13px] text-coral">{actionError}</p>}

      {listQuery.isLoading && <LoadingGate className="min-h-0 py-12" label="FAQ 목록 불러오는 중" />}
      {listQuery.isError && <p className="py-12 text-center text-coral text-[13px]">목록을 불러오지 못했습니다.</p>}
      {listQuery.isSuccess && (
        items.length === 0 ? (
          <p className="py-12 text-center text-charcoal-3 text-[13px]">조건에 맞는 FAQ가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-[13px]">
              <thead className="bg-graysoft text-charcoal-2">
                <tr>
                  <Th>질문</Th><Th>카테고리</Th><Th>공개</Th><Th>조회수</Th><Th>피드백</Th><Th>수정일</Th><Th>순서</Th><Th>액션</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((faq) => {
                  const fullIndex = fullItems.findIndex((item) => item.id === faq.id);
                  const moveUpDisabled = reorderLocked || fullIndex <= 0;
                  const moveDownDisabled = reorderLocked || fullIndex === -1 || fullIndex >= fullItems.length - 1;

                  return (
                    <tr key={faq.id} className="border-t border-line">
                      <Td>
                        <div className="flex flex-wrap items-center gap-2">
                          {faq.pinned && (
                            <span className="rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-bold text-paper">고정</span>
                          )}
                          <Link href={toRoute(`/admin/faqs/${faq.id}/edit`)} className="hover:underline">
                            {faq.question}
                          </Link>
                        </div>
                      </Td>
                      <Td>{faq.categoryName ?? '—'}</Td>
                      <Td>
                        <span
                          className={cn(
                            'inline-block px-2 py-0.5 rounded-full text-[11.5px] font-semibold',
                            faq.published ? 'bg-sage-mist text-ink-deep' : 'bg-graysoft text-charcoal-2',
                          )}
                        >{faq.published ? '공개' : '비공개'}</span>
                      </Td>
                      <Td>{faq.viewCount}</Td>
                      <Td>
                        <span
                          className={cn(
                            'font-medium tabular-nums',
                            faq.notHelpfulCount > faq.helpfulCount ? 'text-coral' : 'text-charcoal-2',
                          )}
                          title={`도움됐어요 ${faq.helpfulCount} · 아쉬워요 ${faq.notHelpfulCount}`}
                          aria-label={`도움됐어요 ${faq.helpfulCount}건 · 아쉬워요 ${faq.notHelpfulCount}건`}
                        >
                          {faq.helpfulCount} / {faq.notHelpfulCount}
                        </span>
                      </Td>
                      <Td>{formatDateKst(faq.updatedAt)}</Td>
                      <Td>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleMove(faq.id, 'up')}
                            disabled={moveUpDisabled}
                            title={filtersActive ? FILTER_DISABLED_TITLE : undefined}
                            aria-label="위로 이동"
                            className="grid h-7 w-7 place-items-center rounded text-charcoal-2 hover:bg-graysoft disabled:opacity-30"
                          >▲</button>
                          <button
                            type="button"
                            onClick={() => handleMove(faq.id, 'down')}
                            disabled={moveDownDisabled}
                            title={filtersActive ? FILTER_DISABLED_TITLE : undefined}
                            aria-label="아래로 이동"
                            className="grid h-7 w-7 place-items-center rounded text-charcoal-2 hover:bg-graysoft disabled:opacity-30"
                          >▼</button>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleField(faq, 'pinned')}
                            className="text-[12px] text-charcoal-2 hover:text-ink"
                          >{faq.pinned ? '고정 해제' : '고정'}</button>
                          <button
                            type="button"
                            onClick={() => handleToggleField(faq, 'published')}
                            className="text-[12px] text-charcoal-2 hover:text-ink"
                          >{faq.published ? '비공개 전환' : '공개 전환'}</button>
                          <Link
                            href={toRoute(`/admin/faqs/${faq.id}/edit`)}
                            className="text-[12px] text-charcoal-2 hover:text-ink"
                          >수정</Link>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ id: faq.id, question: faq.question })}
                            className="text-[12px] text-coral hover:underline"
                          >삭제</button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} ariaLabel="FAQ 관리 페이지" />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="FAQ를 삭제할까요?"
        description={deleteTarget ? `"${deleteTarget.question}" 항목이 더 이상 노출되지 않습니다.` : undefined}
        isPending={deleteMutation.isPending}
        errorMessage={deleteError}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={() => {
          if (!deleteTarget) return;
          setDeleteError(null);
          deleteMutation.mutate(deleteTarget.id, {
            onSuccess: () => setDeleteTarget(null),
            onError: (error) => setDeleteError(extractErrorMessage(error) ?? '삭제에 실패했습니다.'),
          });
        }}
      />
    </main>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left px-3 py-2 font-semibold">{children}</th>
);
const Td = ({ children }: { children: React.ReactNode }) => (
  <td className="px-3 py-2 align-middle">{children}</td>
);
