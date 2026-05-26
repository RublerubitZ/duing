'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useAdminPromotionListQuery,
  useDeletePromotionMutation,
} from '@duing/hooks';
import { AdminPromotionsFilterBar } from '../_components/AdminPromotionsFilterBar';
import { AdminPromotionsTable } from '../_components/AdminPromotionsTable';
import { AdminPromotionDeleteDialog } from '../_components/AdminPromotionDeleteDialog';
import { Pagination } from '../../../notices/_components/Pagination';

type ActiveFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

const PAGE_SIZE = 20;

function toActiveParam(filter: ActiveFilter): boolean | undefined {
  if (filter === 'ACTIVE') return true;
  if (filter === 'INACTIVE') return false;
  return undefined;
}

export function AdminPromotionsListPage() {
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('ALL');
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);

  const listQuery = useAdminPromotionListQuery({
    active: toActiveParam(activeFilter),
    page,
    size: PAGE_SIZE,
  });
  const deleteMutation = useDeletePromotionMutation();

  const items = listQuery.data?.content ?? [];
  const totalPages = listQuery.data?.totalPages ?? 0;

  return (
    <main className="max-w-layout mx-auto px-10 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-ink">홍보 배너 관리</h1>
          <p className="mt-1 text-[13.5px] text-charcoal-2">배너를 등록·수정·삭제합니다.</p>
        </div>
        <Link
          href="/admin/promotions/new"
          className="px-4 py-2 rounded-full bg-ink text-paper text-[13.5px] font-semibold"
        >
          + 배너 등록
        </Link>
      </header>

      <div className="mb-5">
        <AdminPromotionsFilterBar
          activeFilter={activeFilter}
          onActiveFilterChange={(next) => {
            setActiveFilter(next);
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
        <AdminPromotionsTable
          items={items}
          onDeleteClick={(id, title) => setDeleteTarget({ id, title })}
        />
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      <AdminPromotionDeleteDialog
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
