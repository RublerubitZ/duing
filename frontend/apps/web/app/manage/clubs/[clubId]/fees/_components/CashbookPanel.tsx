'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  useCashbookEntriesQuery,
  useCashbookSummaryQuery,
  useDeleteCashbookEntryMutation,
  useToggleCashbookExclusionMutation,
} from '@duing/hooks';
import type { CashbookCategory, CashbookEntry, CashbookEntryType } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { cashbookCategoryLabel, formatWon } from '@/app/_lib/feeLabels';
import { scrollToPaginatedListStart } from '@/app/_lib/paginationScroll';

import { CashbookEntryDialog } from './CashbookEntryDialog';
import { LoadingGate } from '@/components/loading/LoadingGate';

type CashbookPanelProps = {
  clubId: number;
};

type TypeFilter = 'ALL' | CashbookEntryType;

const PAGE_SIZE = 20;
const TYPE_FILTERS: TypeFilter[] = ['ALL', 'INCOME', 'EXPENSE'];
const ALL_CATEGORIES: CashbookCategory[] = ['FEE', 'SPONSOR', 'SUBSIDY', 'MT', 'DINING', 'SNACK', 'SUPPLY', 'MARKETING', 'OTHER'];

function isCashbookCategory(value: string): value is CashbookCategory {
  return ALL_CATEGORIES.some((code) => code === value);
}

export function CashbookPanel({ clubId }: CashbookPanelProps) {
  const { addToast } = useToast();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<CashbookCategory | 'ALL'>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [keyword, setKeyword] = useState('');
  const [hideExcluded, setHideExcluded] = useState(false);
  const [page, setPage] = useState(0);
  const [registerType, setRegisterType] = useState<CashbookEntryType | null>(null);
  const [editTarget, setEditTarget] = useState<CashbookEntry | null>(null);
  // 삭제는 되돌릴 수 없다 — 확인받는 동안 대상 항목을 들고 있는다.
  const [deleteTarget, setDeleteTarget] = useState<CashbookEntry | null>(null);

  const filterParams = useMemo(
    () => ({
      ...(typeFilter !== 'ALL' ? { entryType: typeFilter } : {}),
      ...(categoryFilter !== 'ALL' ? { categoryCode: categoryFilter } : {}),
      ...(fromDate ? { from: fromDate } : {}),
      ...(toDate ? { to: toDate } : {}),
      ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
      ...(hideExcluded ? { hideExcluded: true } : {}),
    }),
    [typeFilter, categoryFilter, fromDate, toDate, keyword, hideExcluded],
  );

  // page 는 목록 요청에만 붙인다 — 합계는 조건 전체를 세므로 페이지를 넘겨도 다시 부르지 않는다.
  const { data: entryPage, isLoading, isFetching } = useCashbookEntriesQuery(clubId, { ...filterParams, page, size: PAGE_SIZE });
  const { data: summary } = useCashbookSummaryQuery(clubId, filterParams);
  const deleteEntry = useDeleteCashbookEntryMutation(clubId);
  const toggleExclusion = useToggleCashbookExclusionMutation(clubId);

  // 지우기·제외·분류로 지금 페이지가 범위 밖이 되면 마지막 유효 페이지로 옮긴다(상태 보정 — useEffect 금지는 데이터 패칭 한정).
  // 다시 받는 중에는 판단하지 않는다 — 새 page 키는 data 가 비어 있고, 무효 표시된 옛 캐시는 지난 totalPages 를 들고 있다.
  const loadedTotalPages = isFetching ? undefined : entryPage?.totalPages;
  useEffect(() => {
    if (loadedTotalPages === undefined) return;
    const lastPage = Math.max(0, loadedTotalPages - 1);
    if (page > lastPage) setPage(lastPage);
  }, [loadedTotalPages, page]);

  const onDelete = (entry: CashbookEntry) => {
    deleteEntry.mutate(entry.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        addToast('장부 항목을 삭제했습니다.');
      },
      onError: (error) => {
        setDeleteTarget(null);
        addToast(error instanceof Error ? error.message : '삭제에 실패했습니다.', { variant: 'error' });
      },
    });
  };

  const onToggleExclusion = (entry: CashbookEntry) => {
    toggleExclusion.mutate(
      { entryId: entry.id, excluded: !entry.excluded },
      {
        onSuccess: () => addToast(entry.excluded ? '집계에 다시 포함했습니다.' : '집계에서 제외했습니다.'),
        onError: (error) =>
          addToast(error instanceof Error ? error.message : '처리에 실패했습니다.', { variant: 'error' }),
      },
    );
  };

  return (
    <div data-pagination-anchor="" className="space-y-4 scroll-mt-16 md:scroll-mt-6">
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="총수입" value={summary?.totalIncome ?? 0} tone="income" />
        <SummaryCard label="총지출" value={summary?.totalExpense ?? 0} tone="expense" />
        <SummaryCard label="장부 잔액" value={summary?.bookBalance ?? 0} tone="balance" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TYPE_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setTypeFilter(value);
              setPage(0);
            }}
            className={cn(
              'rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
              typeFilter === value ? 'border-ink bg-ink text-paper' : 'border-line text-charcoal-2 hover:bg-graysoft',
            )}
          >
            {value === 'ALL' ? '전체' : value === 'INCOME' ? '수입' : '지출'}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setHideExcluded((current) => !current);
            setPage(0);
          }}
          className={cn(
            'rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
            hideExcluded ? 'border-ink bg-ink text-paper' : 'border-line text-charcoal-2 hover:bg-graysoft',
          )}
        >
          제외 항목 숨기기
        </button>
        <select
          aria-label="카테고리 필터"
          value={categoryFilter}
          onChange={(event) => {
            setCategoryFilter(isCashbookCategory(event.target.value) ? event.target.value : 'ALL');
            setPage(0);
          }}
          className="rounded-md border border-field px-3 py-1.5 text-sm outline-none focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink"
        >
          <option value="ALL">전체 카테고리</option>
          {ALL_CATEGORIES.map((code) => (
            <option key={code} value={code}>{cashbookCategoryLabel(code)}</option>
          ))}
        </select>
        <input
          type="date"
          aria-label="시작일"
          value={fromDate}
          onChange={(event) => {
            setFromDate(event.target.value);
            setPage(0);
          }}
          className="rounded-md border border-field px-3 py-1.5 text-sm outline-none focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink"
        />
        <input
          type="date"
          aria-label="종료일"
          value={toDate}
          onChange={(event) => {
            setToDate(event.target.value);
            setPage(0);
          }}
          className="rounded-md border border-field px-3 py-1.5 text-sm outline-none focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink"
        />
        <input
          type="text"
          aria-label="장부 검색"
          placeholder="설명·메모·카테고리 검색"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(0);
          }}
          className="ml-auto rounded-md border border-field px-3 py-1.5 text-sm outline-none focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setRegisterType('INCOME')} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-graysoft">수입 등록</button>
        <button type="button" onClick={() => setRegisterType('EXPENSE')} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-graysoft">지출 등록</button>
      </div>

      {isLoading ? (
        <LoadingGate label="장부 불러오는 중" className="min-h-0 py-8" />
      ) : !entryPage || entryPage.content.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <p className="text-sm text-charcoal-2">장부 항목이 없습니다.</p>
          <p className="mt-1 text-xs text-charcoal-3">수입·지출을 등록하거나 BANK 거래를 동기화하면 표시됩니다.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {entryPage.content.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  // 모바일과 md(사이드바가 붙어 본문이 좁다)에서 한 줄이면 설명·분류가 잘린다 — lg 미만은 설명·분류 줄과 금액·버튼 줄로 나눈다(#1429).
                  'flex flex-col gap-2 rounded-xl border border-line px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4',
                  entry.excluded && 'opacity-60',
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink max-lg:break-keep max-lg:break-words lg:truncate">
                    {entry.description}
                    <span className="ml-1.5 text-xs font-normal text-charcoal-3">
                      {cashbookCategoryLabel(entry.categoryCode, entry.customCategory)}
                    </span>
                    {entry.source === 'BANK_API' && (
                      <span className="ml-1.5 rounded bg-graysoft px-1.5 py-0.5 text-[10px] text-charcoal-3">자동</span>
                    )}
                    {entry.excluded && (
                      <span className="ml-1.5 rounded bg-coral/10 px-1.5 py-0.5 text-[10px] text-coral-deep">제외됨</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-charcoal-3">{entry.transactionDate}{entry.memo ? ` · ${entry.memo}` : ''}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 max-lg:justify-end">
                  <span
                    className={cn(
                      'text-sm font-bold',
                      entry.entryType === 'INCOME' ? 'text-sage-deep' : 'text-coral-deep',
                      entry.excluded && 'line-through',
                    )}
                  >
                    {entry.entryType === 'INCOME' ? '+' : '−'}{formatWon(entry.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleExclusion(entry)}
                    disabled={toggleExclusion.isPending}
                    className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
                  >
                    {entry.excluded ? '복원' : '제외'}
                  </button>
                  <button type="button" onClick={() => setEditTarget(entry)} className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-charcoal-2 transition-colors hover:bg-graysoft">수정</button>
                  {entry.source === 'MANUAL' && (
                    <button type="button" onClick={() => setDeleteTarget(entry)} disabled={deleteEntry.isPending} className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger/5 disabled:opacity-50">삭제</button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* 같은 화면 청구 목록(BillList)과 같은 푸터 — 쪽 표시·버튼 상태는 받은 응답의 page·hasNext 를 따른다. */}
          <footer className="flex items-center justify-between text-xs text-charcoal-3">
            <span>총 {entryPage.totalElements}건</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  setPage((current) => Math.max(0, current - 1));
                  scrollToPaginatedListStart(event.currentTarget);
                }}
                disabled={entryPage.page === 0}
                className="rounded-md border border-line px-2 py-1 disabled:opacity-40"
              >
                이전
              </button>
              <span>
                {entryPage.page + 1} / {Math.max(1, entryPage.totalPages)}
              </span>
              <button
                type="button"
                onClick={(event) => {
                  setPage((current) => current + 1);
                  scrollToPaginatedListStart(event.currentTarget);
                }}
                disabled={!entryPage.hasNext}
                className="rounded-md border border-line px-2 py-1 disabled:opacity-40"
              >
                다음
              </button>
            </div>
          </footer>
        </>
      )}

      {registerType && (
        <CashbookEntryDialog clubId={clubId} entryType={registerType} onClose={() => setRegisterType(null)} />
      )}
      {editTarget && (
        <CashbookEntryDialog clubId={clubId} entryType={editTarget.entryType} entry={editTarget} onClose={() => setEditTarget(null)} />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="이 항목을 삭제할까요?"
        description={
          deleteTarget && (
            <>
              {deleteTarget.entryType === 'INCOME' ? '+' : '−'}
              {formatWon(deleteTarget.amount)} · {deleteTarget.description}
              <br />
              되돌릴 수 없어요.
            </>
          )
        }
        isPending={deleteEntry.isPending}
        busyLabel="항목 삭제 중"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDelete(deleteTarget);
        }}
      />
    </div>
  );
}

type SummaryCardProps = {
  label: string;
  value: number;
  tone: 'income' | 'expense' | 'balance';
};

function SummaryCard({ label, value, tone }: SummaryCardProps) {
  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <p className="text-xs text-charcoal-3">{label}</p>
      <p className={cn('mt-1 text-sm font-bold', tone === 'income' ? 'text-sage-deep' : tone === 'expense' ? 'text-coral-deep' : 'text-ink')}>
        {formatWon(value)}
      </p>
    </div>
  );
}
