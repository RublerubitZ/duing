'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { GlobalEventCategory } from '@duing/types';
import {
  useAdminGlobalEventDeleteMutation,
  useAdminGlobalEventListQuery,
} from '@duing/hooks';
import { toRoute } from '../../../_lib/route';
import { AdminGlobalEventCategoryStats } from '../_components/AdminGlobalEventCategoryStats';
import { AdminGlobalEventDeleteDialog } from '../_components/AdminGlobalEventDeleteDialog';
import { AdminGlobalEventFilterBar } from '../_components/AdminGlobalEventFilterBar';
import { AdminGlobalEventTable } from '../_components/AdminGlobalEventTable';
import { Pagination } from '../../../notices/_components/Pagination';

const PAGE_SIZE = 20;

export function AdminGlobalEventsListPage() {
  const [category, setCategory] = useState<GlobalEventCategory | 'ALL'>('ALL');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);

  const listQuery = useAdminGlobalEventListQuery({
    category: category === 'ALL' ? undefined : category,
    keyword: keyword || undefined,
    page,
    size: PAGE_SIZE,
  });
  const deleteMutation = useAdminGlobalEventDeleteMutation();

  const items = listQuery.data?.content ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-ink">글로벌 이벤트 관리</h1>
          <p className="mt-1 text-[13.5px] text-charcoal-2">
            학교 단위 행사 일정을 등록·수정·삭제합니다. 캘린더에 즉시 반영됩니다.
          </p>
        </div>
        <Link
          href={toRoute('/admin/global-events/new')}
          className="px-4 py-2 rounded-full bg-ink text-paper text-[13.5px] font-semibold"
        >
          + 새 이벤트
        </Link>
      </header>

      <div className="mb-6">
        <AdminGlobalEventCategoryStats />
      </div>

      <div className="mb-5">
        <AdminGlobalEventFilterBar
          category={category}
          keyword={keywordInput}
          onCategoryChange={(next) => {
            setCategory(next);
            setPage(0);
          }}
          onKeywordChange={setKeywordInput}
          onKeywordSubmit={() => {
            setKeyword(keywordInput);
            setPage(0);
          }}
        />
      </div>

      {listQuery.isLoading && (
        <p className="py-12 text-center text-charcoal-3 text-[13px]">불러오는 중…</p>
      )}
      {listQuery.isError && (
        <p className="py-12 text-center text-coral text-[13px]">목록을 불러오지 못했습니다.</p>
      )}
      {listQuery.isSuccess && (
        <AdminGlobalEventTable
          items={items}
          onDeleteClick={(eventId, title) => setDeleteTarget({ id: eventId, title })}
        />
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      <AdminGlobalEventDeleteDialog
        title={deleteTarget?.title ?? null}
        isPending={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget.id, {
            onSuccess: () => setDeleteTarget(null),
          });
        }}
      />
    </main>
  );
}
