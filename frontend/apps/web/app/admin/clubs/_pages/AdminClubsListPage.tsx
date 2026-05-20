'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@duing/api';
import {
  useAdminClubsQuery,
  useUpdateClubStatusMutation,
} from '@duing/hooks';
import type { AdminClubSummary, ClubStatus } from '@duing/types';
import { AdminClubStatusChangeDialog } from '../_components/AdminClubStatusChangeDialog';
import { AdminClubStatusFilter } from '../_components/AdminClubStatusFilter';
import { AdminClubsTable } from '../_components/AdminClubsTable';
import type { StatusAction, StatusFilter } from '../_lib/clubStatus';
import { toRoute } from '../../../_lib/route';

const PAGE_SIZE = 20;

type DialogState = {
  club: AdminClubSummary;
  action: StatusAction;
};

export function AdminClubsListPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING_APPROVAL');
  const [keyword, setKeyword] = useState('');
  const [keywordDraft, setKeywordDraft] = useState('');
  const [page, setPage] = useState(0);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      status: statusFilter === 'ALL' ? undefined : (statusFilter as ClubStatus),
      keyword: keyword.trim() || undefined,
      page,
      size: PAGE_SIZE,
    }),
    [statusFilter, keyword, page],
  );

  const clubsQuery = useAdminClubsQuery(params);
  const statusMutation = useUpdateClubStatusMutation();

  function handleFilterChange(next: StatusFilter) {
    setStatusFilter(next);
    setPage(0);
  }

  function handleKeywordSubmit(event: React.FormEvent) {
    event.preventDefault();
    setKeyword(keywordDraft);
    setPage(0);
  }

  function handleDialogConfirm(rejectionReason?: string) {
    if (!dialog) return;
    setDialogError(null);
    statusMutation.mutate(
      {
        clubId: dialog.club.id,
        payload: {
          status: dialog.action.nextStatus,
          ...(rejectionReason !== undefined && { rejectionReason }),
        },
      },
      {
        onSuccess: () => {
          setDialog(null);
        },
        onError: (mutationError) => {
          const message =
            mutationError instanceof ApiError
              ? mutationError.message
              : '상태 변경에 실패했습니다.';
          setDialogError(message);
        },
      },
    );
  }

  function handleDialogCancel() {
    setDialog(null);
    setDialogError(null);
  }

  const page0Based = clubsQuery.data?.page ?? 0;
  const totalPages = clubsQuery.data?.totalPages ?? 0;
  const hasNext = clubsQuery.data?.hasNext ?? false;
  const totalElements = clubsQuery.data?.totalElements ?? 0;

  return (
    <main className="max-w-layout mx-auto px-10 py-10">
      <header className="mb-6">
        <p className="text-charcoal-3 text-xs font-semibold">총동연 콘솔</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">동아리 관리</h1>
      </header>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <AdminClubStatusFilter value={statusFilter} onChange={handleFilterChange} />
        <Link
          href={toRoute('/admin/clubs/new')}
          className="btn btn-primary rounded-full px-4 text-[13px]"
        >
          + 새 동아리 등록
        </Link>
      </div>

      <form onSubmit={handleKeywordSubmit} className="mb-4 flex gap-2">
        <input
          type="search"
          value={keywordDraft}
          onChange={(event) => setKeywordDraft(event.target.value)}
          placeholder="이름 또는 설명으로 검색"
          className="border-line bg-paper w-full max-w-sm rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="border-line text-charcoal-2 hover:bg-graysoft rounded-md border px-3 py-2 text-sm"
        >
          검색
        </button>
        {keyword && (
          <button
            type="button"
            onClick={() => {
              setKeyword('');
              setKeywordDraft('');
              setPage(0);
            }}
            className="text-charcoal-3 rounded-md px-2 py-2 text-xs hover:underline"
          >
            초기화
          </button>
        )}
      </form>

      {clubsQuery.isLoading && (
        <p className="text-charcoal-3 py-10 text-center text-sm">불러오는 중…</p>
      )}
      {clubsQuery.isError && (
        <p className="text-coral py-10 text-center text-sm">목록을 불러오지 못했습니다.</p>
      )}
      {clubsQuery.data && (
        <>
          <AdminClubsTable
            clubs={clubsQuery.data.content}
            onActionClick={(club, action) => {
              setDialog({ club, action });
              setDialogError(null);
            }}
          />
          <footer className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>총 {totalElements}건</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page0Based === 0}
                className="border-line rounded-md border px-2 py-1 disabled:opacity-40"
              >
                이전
              </button>
              <span>
                {page0Based + 1} / {Math.max(1, totalPages)}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={!hasNext}
                className="border-line rounded-md border px-2 py-1 disabled:opacity-40"
              >
                다음
              </button>
            </div>
          </footer>
        </>
      )}

      {dialog && (
        <AdminClubStatusChangeDialog
          club={dialog.club}
          action={dialog.action}
          isPending={statusMutation.isPending}
          errorMessage={dialogError}
          onConfirm={handleDialogConfirm}
          onCancel={handleDialogCancel}
        />
      )}
    </main>
  );
}
