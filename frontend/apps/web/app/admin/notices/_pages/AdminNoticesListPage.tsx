'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { NoticeVisibility } from '@duing/types';
import {
  useAdminNoticeListQuery,
  useAdminNoticeDeleteMutation,
} from '@duing/hooks';
import { Pagination } from '@/components/Pagination';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';
import { AdminNoticesFilterBar } from '../_components/AdminNoticesFilterBar';
import { AdminNoticesTable } from '../_components/AdminNoticesTable';

const PAGE_SIZE = 20;

export function AdminNoticesListPage() {
  const [visibility, setVisibility] = useState<NoticeVisibility | 'ALL'>('ALL');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [includeExpired, setIncludeExpired] = useState(false);
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  // 삭제 실패는 확인 모달 안에 남긴다(공통 규칙) — 목록 위에 그리면 오버레이 뒤에 갇힌다.
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

      {listQuery.isLoading && <LoadingGate label="공지 목록 불러오는 중" />}
      {listQuery.isError && <p className="py-12 text-center text-coral text-[13px]">목록을 불러오지 못했습니다.</p>}
      {listQuery.isSuccess && (
        <AdminNoticesTable
          items={items}
          onDeleteClick={(id, title) => setDeleteTarget({ id, title })}
        />
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="공지를 삭제할까요?"
        description={deleteTarget ? `"${deleteTarget.title}" 항목이 더 이상 노출되지 않습니다.` : undefined}
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