'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { NoticeVisibility } from '@duing/types';
import {
  useAdminNoticeListQuery,
  useAdminNoticeDeleteMutation,
} from '@duing/hooks';
import { Pagination } from '@/components/Pagination';
import { AdminNoticesFilterBar } from '../_components/AdminNoticesFilterBar';
import { AdminNoticesTable } from '../_components/AdminNoticesTable';
import { AdminNoticeDeleteDialog } from '../_components/AdminNoticeDeleteDialog';

const PAGE_SIZE = 20;

export function AdminNoticesListPage() {
  const [visibility, setVisibility] = useState<NoticeVisibility | 'ALL'>('ALL');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [includeExpired, setIncludeExpired] = useState(false);
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);

  const listQuery = useAdminNoticeListQuery({
    visibility: visibility === 'ALL' ? undefined : visibility,
    keyword: keyword || undefined,
    includeExpired,
    page,
    size: PAGE_SIZE,
  });
  const deleteMutation = useAdminNoticeDeleteMutation();

  const items = listQuery.data?.content ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-ink">공지 관리</h1>
          <p className="mt-1 text-[13.5px] text-charcoal-2">총동연 공지를 작성·수정·삭제합니다.</p>
        </div>
        <Link
          href="/admin/notices/new"
          className="px-4 py-2 rounded-full bg-ink text-paper text-[13.5px] font-semibold"
        >+ 새 공지</Link>
      </header>

      <div className="mb-5">
        <AdminNoticesFilterBar
          visibility={visibility}
          keyword={keywordInput}
          includeExpired={includeExpired}
          onVisibilityChange={(next) => { setVisibility(next); setPage(0); }}
          onKeywordChange={setKeywordInput}
          onKeywordSubmit={() => { setKeyword(keywordInput); setPage(0); }}
          onIncludeExpiredChange={(next) => { setIncludeExpired(next); setPage(0); }}
        />
      </div>

      {listQuery.isLoading && <p className="py-12 text-center text-charcoal-3 text-[13px]">불러오는 중…</p>}
      {listQuery.isError && <p className="py-12 text-center text-coral text-[13px]">목록을 불러오지 못했습니다.</p>}
      {listQuery.isSuccess && (
        <AdminNoticesTable
          items={items}
          onDeleteClick={(id, title) => setDeleteTarget({ id, title })}
        />
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      <AdminNoticeDeleteDialog
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