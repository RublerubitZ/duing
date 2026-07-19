'use client';

import { useState } from 'react';

import { ApiError } from '@duing/api';
import { useAdminForceLogoutMutation, useAdminUserSearchQuery } from '@duing/hooks';
import type { AdminUserSearchResult } from '@duing/types';

import { useToast } from '@/app/_components/toast/ToastProvider';
import { Pagination } from '@/components/Pagination';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { useDebouncedValue } from '../../_hooks/useDebouncedValue';
import { AdminUsersTable } from '../_components/AdminUsersTable';
import { AdminForceLogoutDialog } from '../_components/AdminForceLogoutDialog';

const PAGE_SIZE = 20;

function forceLogoutErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return '강제 로그아웃에 실패했어요. 잠시 후 다시 시도해주세요.';
}

const inputCls =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function AdminUsersPage() {
  const [input, setInput] = useState('');
  const [page, setPage] = useState(0);
  const [target, setTarget] = useState<AdminUserSearchResult | null>(null);
  const { addToast } = useToast();

  const debouncedQuery = useDebouncedValue(input.trim(), 300);
  const hasQuery = debouncedQuery.length > 0;

  const searchQuery = useAdminUserSearchQuery({ q: debouncedQuery, page, size: PAGE_SIZE });
  const forceLogout = useAdminForceLogoutMutation();

  const items = searchQuery.data?.content ?? [];
  const totalPages = searchQuery.data?.totalPages ?? 0;

  const handleInputChange = (value: string) => {
    setInput(value);
    setPage(0);
  };

  const handleConfirm = () => {
    if (!target) return;
    forceLogout.mutate(target.id, {
      onSuccess: () => {
        addToast('강제 로그아웃 처리했어요. 대상 회원의 모든 기기가 로그아웃됩니다.');
        setTarget(null);
      },
      onError: (error) => addToast(forceLogoutErrorMessage(error), { variant: 'error' }),
    });
  };

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6">
        <h1 className="text-[22px] font-bold text-ink">회원 관리</h1>
        <p className="mt-1 text-[13.5px] text-charcoal-2">
          학번 또는 이름으로 회원을 검색하고 강제 로그아웃 등 계정 조치를 처리합니다.
        </p>
      </header>

      <div className="mb-5">
        <input
          type="search"
          aria-label="회원 검색"
          value={input}
          onChange={(event) => handleInputChange(event.target.value)}
          placeholder="학번 또는 이름으로 검색"
          className={inputCls}
        />
      </div>

      {!hasQuery && (
        <p className="py-12 text-center text-charcoal-3 text-[13px]">
          학번 또는 이름으로 회원을 검색하세요.
        </p>
      )}

      {hasQuery && searchQuery.isLoading && (
        <ListRowsSkeleton rows={5} rowClassName="h-12 rounded-md" label="회원 검색 중" />
      )}

      {hasQuery && searchQuery.isError && (
        <p className="py-12 text-center text-coral text-[13px]">회원을 불러오지 못했습니다.</p>
      )}

      {hasQuery && searchQuery.isSuccess && (
        <>
          <AdminUsersTable items={items} onForceLogout={setTarget} />
          <Pagination page={page} totalPages={totalPages} onChange={setPage} ariaLabel="회원 검색 페이지" />
        </>
      )}

      {target && (
        <AdminForceLogoutDialog
          user={target}
          isPending={forceLogout.isPending}
          onConfirm={handleConfirm}
          onCancel={() => setTarget(null)}
        />
      )}
    </main>
  );
}
