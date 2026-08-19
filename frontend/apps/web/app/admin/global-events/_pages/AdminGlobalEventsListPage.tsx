'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { GlobalEventCategory } from '@duing/types';
import {
  useAdminGlobalEventDeleteMutation,
  useAdminGlobalEventListQuery,
} from '@duing/hooks';
import { Pagination } from '@/components/Pagination';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';
import { toRoute } from '../../../_lib/route';
import { AdminGlobalEventCategoryStats } from '../_components/AdminGlobalEventCategoryStats';
import { AdminGlobalEventFilterBar } from '../_components/AdminGlobalEventFilterBar';
import { AdminGlobalEventTable } from '../_components/AdminGlobalEventTable';

const PAGE_SIZE = 20;

export function AdminGlobalEventsListPage() {
  const [category, setCategory] = useState<GlobalEventCategory | 'ALL'>('ALL');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  // 삭제 실패는 확인 모달 안에 남긴다(공통 규칙) — 목록 위에 그리면 오버레이 뒤에 갇힌다.
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

      {listQuery.isLoading && <LoadingGate label="이벤트 목록 불러오는 중" />}
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

      <ConfirmDialog
        open={deleteTarget !== null}
        title="이벤트 삭제"
        description={
          deleteTarget ? (
            <>
              &quot;<strong className="font-semibold text-ink">{deleteTarget.title}</strong>&quot; 를 삭제하시겠어요? 캘린더에서 즉시 사라집니다.
            </>
          ) : undefined
        }
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
