'use client';

import { useState } from 'react';

import { ApiError } from '@duing/api';
import { useAdminForceLogoutMutation, useAdminUserSearchQuery } from '@duing/hooks';
import type { AdminUserDetail, AdminUserSearchResult, UserStatus } from '@duing/types';

import { useToast } from '@/app/_components/toast/ToastProvider';
import { Pagination } from '@/components/Pagination';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { useDebouncedValue } from '../../_hooks/useDebouncedValue';
import { AdminUsersTable } from '../_components/AdminUsersTable';
import { AdminUserStatusFilter } from '../_components/AdminUserStatusFilter';
import { AdminForceLogoutDialog } from '../_components/AdminForceLogoutDialog';
import { AdminUserDetailSheet } from '../_components/AdminUserDetailSheet';

const PAGE_SIZE = 20;

/** 상세 패널이 올려보내는 조치 요청. 확인 다이얼로그는 Task 12 에서 이 상태를 읽는다. */
type PendingUserAction = {
  kind: 'SUSPEND' | 'UNSUSPEND' | 'FORCE_LOGOUT';
  user: AdminUserDetail;
};

function forceLogoutErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return '강제 로그아웃에 실패했어요. 잠시 후 다시 시도해주세요.';
}

const inputCls =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function AdminUsersPage() {
  const [input, setInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [target, setTarget] = useState<AdminUserSearchResult | null>(null);
  const [detailUserId, setDetailUserId] = useState<number | null>(null);
  // Task 12 의 확인 다이얼로그가 읽는다 — 지금은 대상 선택만 끌어올려 둔다.
  const [, setPendingAction] = useState<PendingUserAction | null>(null);
  const { addToast } = useToast();

  const debouncedQuery = useDebouncedValue(input.trim(), 300);

  // 검색어 없이도 최근 가입순 목록을 보여준다. 이 게이트는 이 화면에서만 연다 —
  // 같은 훅을 쓰는 동아리장 검색 콤보박스가 열리자마자 전체 회원을 쏟아내면 안 된다.
  const searchQuery = useAdminUserSearchQuery(
    { q: debouncedQuery, status: statusFilter, page, size: PAGE_SIZE },
    { allowEmptyQuery: true },
  );
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
          학번 또는 이름으로 회원을 찾고, 계정 상태 변경·강제 로그아웃 등 운영 조치를 처리합니다.
        </p>
      </header>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          aria-label="회원 검색"
          value={input}
          onChange={(event) => handleInputChange(event.target.value)}
          placeholder="학번 또는 이름으로 검색"
          className={inputCls}
        />
        <AdminUserStatusFilter
          value={statusFilter}
          onChange={(next) => {
            setStatusFilter(next);
            setPage(0);
          }}
        />
      </div>

      {searchQuery.isLoading && (
        <ListRowsSkeleton rows={5} rowClassName="h-12 rounded-md" label="회원 조회 중" />
      )}

      {searchQuery.isError && (
        <p className="py-12 text-center text-coral text-[13px]">회원을 불러오지 못했습니다.</p>
      )}

      {searchQuery.isSuccess && (
        <>
          <AdminUsersTable
            items={items}
            onOpenDetail={(user) => setDetailUserId(user.id)}
            onForceLogout={setTarget}
          />
          <Pagination page={page} totalPages={totalPages} onChange={setPage} ariaLabel="회원 목록 페이지" />
        </>
      )}

      {detailUserId !== null && (
        <AdminUserDetailSheet
          userId={detailUserId}
          onClose={() => setDetailUserId(null)}
          onSuspend={(user) => setPendingAction({ kind: 'SUSPEND', user })}
          onUnsuspend={(user) => setPendingAction({ kind: 'UNSUSPEND', user })}
          onForceLogout={(user) => setPendingAction({ kind: 'FORCE_LOGOUT', user })}
        />
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
