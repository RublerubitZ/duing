'use client';

import { useEffect, useState } from 'react';

import { ApiError } from '@duing/api';
import {
  useAdminForceLogoutMutation,
  useAdminUserSearchQuery,
  useAdminUserStatusMutation,
} from '@duing/hooks';
import type { AdminUserDetail, AdminUserSearchResult, UserStatus } from '@duing/types';

import { useSearchParams } from 'next/navigation';

import { useToast } from '@/app/_components/toast/ToastProvider';
import { toRoute } from '@/app/_lib/route';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { Pagination } from '@/components/Pagination';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { ConsoleCard } from '../../_components/ConsoleCard';
import { ErrorState } from '../../_components/ErrorState';
import { useDebouncedValue } from '../../_hooks/useDebouncedValue';
import { AdminUserKpis } from '../_components/AdminUserKpis';
import { buildUsersQuery, parsePageParam, parseStatusParam } from '../_lib/usersQuerySync';
import { AdminUsersTable } from '../_components/AdminUsersTable';
import { AdminUserStatusFilter } from '../_components/AdminUserStatusFilter';
import { AdminForceLogoutDialog } from '../_components/AdminForceLogoutDialog';
import { AdminUserDetailSheet } from '../_components/AdminUserDetailSheet';
import { AdminUserStatusDialog } from '../_components/AdminUserStatusDialog';

const PAGE_SIZE = 20;

/** 상세 패널이 올려보낸 정지·해제 요청. 확인 다이얼로그가 이 상태를 읽는다. */
type StatusTarget = {
  detail: AdminUserDetail;
  nextStatus: UserStatus;
};

function forceLogoutErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return '강제 로그아웃에 실패했어요. 잠시 후 다시 시도해주세요.';
}

// 자기 자신·다른 ADMIN 정지는 서버가 400 으로 막는다. 그 메시지가 이미 사용자 대면 문구라 그대로 보여준다.
function statusErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return '계정 상태 변경에 실패했어요. 잠시 후 다시 시도해주세요.';
}

const inputCls =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function AdminUsersPage() {
  // 검색어만 컴포넌트 상태다 — 이름·학번이 주소에 실리면 방문 기록·referrer·페이지뷰 이벤트로 새어나간다.
  const [input, setInput] = useState('');
  const router = useGuardedRouter();
  const searchParams = useSearchParams();
  const statusFilter = parseStatusParam(searchParams.get('status'));
  const page = parsePageParam(searchParams.get('page'));
  const [target, setTarget] = useState<AdminUserSearchResult | null>(null);
  const [detailUserId, setDetailUserId] = useState<number | null>(null);
  const [statusTarget, setStatusTarget] = useState<StatusTarget | null>(null);
  const { addToast } = useToast();

  const debouncedQuery = useDebouncedValue(input.trim(), 300);

  // 검색어 없이도 최근 가입순 목록을 보여준다. 이 게이트는 이 화면에서만 연다 —
  // 같은 훅을 쓰는 동아리장 검색 콤보박스가 열리자마자 전체 회원을 쏟아내면 안 된다.
  const searchQuery = useAdminUserSearchQuery(
    { q: debouncedQuery, status: statusFilter, page, size: PAGE_SIZE },
    { allowEmptyQuery: true },
  );
  const forceLogout = useAdminForceLogoutMutation();
  const changeStatus = useAdminUserStatusMutation();

  const items = searchQuery.data?.content ?? [];
  const totalPages = searchQuery.data?.totalPages ?? 0;

  /** 필터·페이지만 주소에 반영한다. replace 라 필터를 바꿀 때마다 뒤로가기 기록이 쌓이지 않는다. */
  const syncQuery = (nextStatus: UserStatus | undefined, nextPage: number) => {
    router.replace(toRoute(`/admin/users${buildUsersQuery(nextStatus, nextPage)}`), {
      scroll: false,
    });
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    // 검색어를 바꾸면 첫 페이지로 돌아간다 — 3페이지를 물고 가면 대개 빈 목록이 나온다.
    if (page !== 0) syncQuery(statusFilter, 0);
  };

  // 목록이 줄어 지금 페이지가 사라지면 첫 페이지로 되돌린다. 페이지가 컴포넌트 상태일 때는 새로고침이
  // 탈출구였지만 주소에 남게 되면서 새로고침으로도 안 풀린다 — 마지막 회원을 정지시켜 그 페이지가
  // 통째로 사라지면 빈 화면에 갇힌다(페이지 이동 버튼은 총 페이지가 1이면 렌더되지 않는다).
  useEffect(() => {
    if (!searchQuery.isSuccess) return;
    if (totalPages > 0 && page > totalPages - 1) syncQuery(statusFilter, 0);
    // syncQuery 는 매 렌더 새 함수라 의존성에 넣으면 매 렌더 실행된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery.isSuccess, totalPages, page, statusFilter]);

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

  const handleStatusConfirm = (reason: string) => {
    if (!statusTarget) return;
    changeStatus.mutate(
      { userId: statusTarget.detail.id, status: statusTarget.nextStatus, reason },
      {
        onSuccess: () => {
          addToast(
            statusTarget.nextStatus === 'SUSPENDED'
              ? '계정을 정지했어요. 대상 회원의 모든 기기가 로그아웃됩니다.'
              : '계정 정지를 해제했어요. 다시 로그인할 수 있습니다.',
          );
          setStatusTarget(null);
        },
        // 실패해도 다이얼로그를 닫지 않는다 — 사유를 다시 치게 만들지 않고 그 자리에서 재시도할 수 있다.
        onError: (error) => addToast(statusErrorMessage(error), { variant: 'error' }),
      },
    );
  };

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">회원 관리</h1>
          <p className="mt-1 text-[13.5px] text-charcoal-2">
            학번 또는 이름으로 회원을 찾고, 계정 상태 변경·강제 로그아웃 등 운영 조치를 처리합니다.
          </p>
        </div>
        {/* 이 화면이 조회 중심이라는 것을 먼저 알린다 — 회원 정보를 고치러 온 사람이 헤매지 않게. */}
        <span className="inline-flex shrink-0 items-center gap-2 rounded-[10px] border border-line bg-paper px-3 py-2 text-[12px] text-charcoal-2">
          <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-ink" />
          ADMIN 전용 · 조회 중심
        </span>
      </header>

      <AdminUserKpis />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          aria-label="회원 검색"
          value={input}
          onChange={(event) => handleInputChange(event.target.value)}
          placeholder="학번 또는 이름으로 검색"
          className={inputCls}
        />
        <AdminUserStatusFilter value={statusFilter} onChange={(next) => syncQuery(next, 0)} />
      </div>

      {searchQuery.isLoading && (
        <ListRowsSkeleton rows={5} rowClassName="h-12 rounded-md" label="회원 조회 중" />
      )}

      {searchQuery.isError && (
        <ConsoleCard>
          <ErrorState
            message="회원을 불러오지 못했어요."
            onRetry={() => void searchQuery.refetch()}
          />
        </ConsoleCard>
      )}

      {searchQuery.isSuccess && (
        <>
          <AdminUsersTable
            items={items}
            onOpenDetail={(user) => setDetailUserId(user.id)}
            onForceLogout={setTarget}
          />
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={(nextPage) => syncQuery(statusFilter, nextPage)}
            ariaLabel="회원 목록 페이지"
          />
        </>
      )}

      {detailUserId !== null && (
        <AdminUserDetailSheet
          userId={detailUserId}
          onClose={() => setDetailUserId(null)}
          onSuspend={(user) => setStatusTarget({ detail: user, nextStatus: 'SUSPENDED' })}
          onUnsuspend={(user) => setStatusTarget({ detail: user, nextStatus: 'ACTIVE' })}
          // 상세의 강제 로그아웃은 목록 행과 같은 다이얼로그로 보낸다 — 확인 절차가 두 벌일 이유가 없다.
          onForceLogout={(user) => setTarget(user)}
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

      {statusTarget && (
        <AdminUserStatusDialog
          detail={statusTarget.detail}
          nextStatus={statusTarget.nextStatus}
          isPending={changeStatus.isPending}
          onConfirm={handleStatusConfirm}
          onCancel={() => setStatusTarget(null)}
        />
      )}
    </main>
  );
}
