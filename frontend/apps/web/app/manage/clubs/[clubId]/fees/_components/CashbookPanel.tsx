'use client';

import { useMemo, useState } from 'react';

import { useCashbookEntriesQuery, useCashbookSummaryQuery, useDeleteCashbookEntryMutation } from '@duing/hooks';
import type { CashbookEntry, CashbookEntryType } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { cashbookCategoryLabel, formatWon } from '@/app/_lib/feeLabels';

import { CashbookEntryDialog } from './CashbookEntryDialog';

type CashbookPanelProps = {
  clubId: number;
};

type TypeFilter = 'ALL' | CashbookEntryType;

const PAGE_SIZE = 20;

export function CashbookPanel({ clubId }: CashbookPanelProps) {
  const { addToast } = useToast();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [keyword, setKeyword] = useState('');
  const [registerType, setRegisterType] = useState<CashbookEntryType | null>(null);
  const [editTarget, setEditTarget] = useState<CashbookEntry | null>(null);

  const params = useMemo(
    () => ({
      ...(typeFilter !== 'ALL' ? { entryType: typeFilter } : {}),
      ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
      page: 0,
      size: PAGE_SIZE,
    }),
    [typeFilter, keyword],
  );

  const { data: page, isLoading } = useCashbookEntriesQuery(clubId, params);
  const { data: summary } = useCashbookSummaryQuery(clubId, params);
  const deleteEntry = useDeleteCashbookEntryMutation(clubId);

  const onDelete = (entry: CashbookEntry) => {
    deleteEntry.mutate(entry.id, {
      onSuccess: () => addToast('장부 항목을 삭제했습니다.'),
      onError: (error) =>
        addToast(error instanceof Error ? error.message : '삭제에 실패했습니다.', { variant: 'error' }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="총수입" value={summary?.totalIncome ?? 0} tone="income" />
        <SummaryCard label="총지출" value={summary?.totalExpense ?? 0} tone="expense" />
        <SummaryCard label="장부 잔액" value={summary?.bookBalance ?? 0} tone="balance" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['ALL', 'INCOME', 'EXPENSE'] as TypeFilter[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTypeFilter(value)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
              typeFilter === value ? 'border-ink bg-ink text-paper' : 'border-line text-charcoal-2 hover:bg-graysoft',
            )}
          >
            {value === 'ALL' ? '전체' : value === 'INCOME' ? '수입' : '지출'}
          </button>
        ))}
        <input
          type="text"
          aria-label="장부 검색"
          placeholder="설명·메모·카테고리 검색"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          className="ml-auto rounded-md border border-line px-3 py-1.5 text-sm outline-none focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setRegisterType('INCOME')} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-graysoft">수입 등록</button>
        <button type="button" onClick={() => setRegisterType('EXPENSE')} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-graysoft">지출 등록</button>
      </div>

      {isLoading ? (
        <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>
      ) : !page || page.content.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <p className="text-sm text-charcoal-2">장부 항목이 없습니다.</p>
          <p className="mt-1 text-xs text-charcoal-3">수입·지출을 등록하거나 BANK 거래를 동기화하면 표시됩니다.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {page.content.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {entry.description}
                  <span className="ml-1.5 text-xs font-normal text-charcoal-3">
                    {cashbookCategoryLabel(entry.categoryCode, entry.customCategory)}
                  </span>
                  {entry.source === 'BANK_API' && (
                    <span className="ml-1.5 rounded bg-graysoft px-1.5 py-0.5 text-[10px] text-charcoal-3">자동</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-charcoal-3">{entry.transactionDate}{entry.memo ? ` · ${entry.memo}` : ''}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={cn('text-sm font-bold', entry.entryType === 'INCOME' ? 'text-sage' : 'text-coral')}>
                  {entry.entryType === 'INCOME' ? '+' : '−'}{formatWon(entry.amount)}
                </span>
                <button type="button" onClick={() => setEditTarget(entry)} className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-charcoal-2 transition-colors hover:bg-graysoft">수정</button>
                {entry.source === 'MANUAL' && (
                  <button type="button" onClick={() => onDelete(entry)} disabled={deleteEntry.isPending} className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-coral transition-colors hover:bg-coral/5 disabled:opacity-50">삭제</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {registerType && (
        <CashbookEntryDialog clubId={clubId} entryType={registerType} onClose={() => setRegisterType(null)} />
      )}
      {editTarget && (
        <CashbookEntryDialog clubId={clubId} entryType={editTarget.entryType} entry={editTarget} onClose={() => setEditTarget(null)} />
      )}
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
      <p className={cn('mt-1 text-sm font-bold', tone === 'income' ? 'text-sage' : tone === 'expense' ? 'text-coral' : 'text-ink')}>
        {formatWon(value)}
      </p>
    </div>
  );
}
