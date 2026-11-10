'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ApiError } from '@duing/api';
import {
  useAdminClubsQuery,
  useCleanupClubPendingMutation,
  useCloseClubMutation,
  useUpdateClubCentralClubMutation,
  useUpdateClubFacilitySecuredTimeTargetMutation,
  useUpdateClubStatusMutation,
} from '@duing/hooks';
import type { AdminClubSignal, AdminClubSummary } from '@duing/types';
import { scrollToPaginatedListStart } from '@/app/_lib/paginationScroll';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { AdminClubCentralClubToggleDialog } from '../_components/AdminClubCentralClubToggleDialog';
import { AdminClubSecuredTargetToggleDialog } from '../_components/AdminClubSecuredTargetToggleDialog';
import { AdminClubDeleteDialog } from '../_components/AdminClubDeleteDialog';
import { AdminClubPendingCleanupDialog } from '../_components/AdminClubPendingCleanupDialog';
import { AdminClubStatusChangeDialog } from '../_components/AdminClubStatusChangeDialog';
import { AdminClubStatusFilter } from '../_components/AdminClubStatusFilter';
import { AdminClubsTable } from '../_components/AdminClubsTable';
import { STATUS_FILTER_ORDER, statusFilterParams, type StatusAction, type StatusFilter } from '../_lib/clubStatus';
import {
  CONTACT_SIGNAL_GUIDE,
  SIGNAL_LABEL,
  SIGNAL_ORDER,
  USAGE_SIGNAL_GUIDE,
  isContactSignal,
  signalFilterParams,
  signalScopeText,
} from '../_lib/clubSignals';
import { pendingCleanupResultMessage, type PendingCleanupCounts } from '../_lib/pendingCleanup';
import { pickSearchParam } from '../../_lib/searchParamChoice';
import { toRoute } from '../../../_lib/route';

const PAGE_SIZE = 20;

type DialogState = {
  club: AdminClubSummary;
  action: StatusAction;
};

export function AdminClubsListPage() {
  const searchParams = useSearchParams();
  // 홈 동아리 현황 카드가 ?signal= 로, '운영 중단 미결' 칸이 ?status= 로 첫 화면을 고른다. 주소는 첫 값으로만 읽고 탭·해제로 바꿔도 고치지 않는다.
  // 신호는 운영 중 조건을 품어 status 주소값보다 우선한다(모르는 신호는 무시 — 서버 400 을 부르지 않는다).
  // 주소만 바뀐 이동(사이드바로 같은 메뉴·홈 카드의 다른 링크)에도 첫 값부터 다시 시작하도록 key 로 초기화한다(신고·모집 목록 선례).
  const initialSignal = pickSearchParam(searchParams.get('signal'), SIGNAL_ORDER);
  const initialFilter: StatusFilter = initialSignal
    ? 'ACTIVE'
    : (pickSearchParam(searchParams.get('status'), STATUS_FILTER_ORDER) ?? 'PENDING_APPROVAL');
  return (
    <AdminClubsList
      key={`${initialFilter}:${initialSignal ?? ''}`}
      initialFilter={initialFilter}
      initialSignal={initialSignal}
    />
  );
}

function AdminClubsList({
  initialFilter,
  initialSignal,
}: {
  initialFilter: StatusFilter;
  initialSignal: AdminClubSignal | undefined;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialFilter);
  const [signal, setSignal] = useState<AdminClubSignal | undefined>(initialSignal);
  const [keyword, setKeyword] = useState('');
  const [keywordDraft, setKeywordDraft] = useState('');
  const [page, setPage] = useState(0);
  // 신호 조건 해제 뒤 포커스를 옮길 곳 — 신호가 걸린 동안 선택된 탭은 늘 '운영 중'이다.
  const selectedTabRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [centralClubDialog, setCentralClubDialog] = useState<AdminClubSummary | null>(null);
  const [centralClubError, setCentralClubError] = useState<string | null>(null);
  const [securedTargetDialog, setSecuredTargetDialog] = useState<AdminClubSummary | null>(null);
  const [securedTargetError, setSecuredTargetError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<AdminClubSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const closeMutation = useCloseClubMutation();
  const [cleanupDialog, setCleanupDialog] = useState<{ club: AdminClubSummary; counts: PendingCleanupCounts } | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const cleanupMutation = useCleanupClubPendingMutation();
  // 확인 창 다섯 개의 확정 연타 동기 가드 — isPending 은 렌더 값이라 같은 틱의 두 번째 클릭(disabled 가 그려지기 전)을 못 막는다.
  // 창은 한 번에 하나만 열리므로 페이지에 하나만 둔다.
  const isConfirmSubmittingRef = useRef(false);
  const { addToast } = useToast();

  const params = useMemo(
    () => ({
      ...(signal ? signalFilterParams(signal) : statusFilterParams(statusFilter)),
      keyword: keyword.trim() || undefined,
      page,
      size: PAGE_SIZE,
    }),
    [signal, statusFilter, keyword, page],
  );

  const clubsQuery = useAdminClubsQuery(params);
  const statusMutation = useUpdateClubStatusMutation();
  const centralClubMutation = useUpdateClubCentralClubMutation();
  const securedTargetMutation = useUpdateClubFacilitySecuredTimeTargetMutation();

  function handleFilterChange(next: StatusFilter) {
    // 다른 탭이든 이미 선택된 '운영 중' 탭 재클릭이든 신호를 푼다(탭은 선택된 탭 클릭에도 onChange 를 부른다).
    setSignal(undefined);
    setStatusFilter(next);
    setPage(0);
  }

  function handleSignalClear() {
    setSignal(undefined);
    setPage(0);
    // 해제 버튼은 신호 줄과 함께 사라진다 — 포커스를 '운영 중' 탭으로 옮긴다(검색어는 그대로 둔다).
    selectedTabRef.current?.focus();
  }

  function resetKeyword() {
    setKeyword('');
    setKeywordDraft('');
    setPage(0);
    // 검색 칸 옆 '초기화'와 0건 문구의 '검색 초기화' 모두 검색어와 함께 사라진다 — 포커스를 검색 칸으로 옮긴다.
    searchInputRef.current?.focus();
  }

  function handleKeywordSubmit(event: React.FormEvent) {
    event.preventDefault();
    setKeyword(keywordDraft);
    setPage(0);
  }

  function handleDialogConfirm(rejectionReason?: string) {
    if (!dialog || isConfirmSubmittingRef.current) return;
    setDialogError(null);
    isConfirmSubmittingRef.current = true;
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
        onSettled: () => {
          isConfirmSubmittingRef.current = false;
        },
      },
    );
  }

  function handleDialogCancel() {
    setDialog(null);
    setDialogError(null);
  }

  function handleCloseClick(club: AdminClubSummary) {
    setDeleteError(null);
    setDeleteDialog(club);
  }

  function handleCloseConfirm(closureReason?: string) {
    if (!deleteDialog || isConfirmSubmittingRef.current) return;
    setDeleteError(null);
    isConfirmSubmittingRef.current = true;
    closeMutation.mutate(
      { clubId: deleteDialog.id, payload: { ...(closureReason !== undefined && { closureReason }) } },
      {
        onSuccess: () => setDeleteDialog(null),
        onError: (mutationError) => {
          const message =
            mutationError instanceof ApiError ? mutationError.message : '삭제에 실패했습니다.';
          setDeleteError(message);
        },
        onSettled: () => {
          isConfirmSubmittingRef.current = false;
        },
      },
    );
  }

  function handleCloseCancel() {
    setDeleteDialog(null);
    setDeleteError(null);
  }

  function handlePendingCleanupClick(club: AdminClubSummary, counts: PendingCleanupCounts) {
    setCleanupError(null);
    setCleanupDialog({ club, counts });
  }

  function handlePendingCleanupConfirm() {
    if (!cleanupDialog || isConfirmSubmittingRef.current) return;
    isConfirmSubmittingRef.current = true;
    setCleanupError(null);
    cleanupMutation.mutate(cleanupDialog.club.id, {
      onSuccess: (cleanupResult) => {
        setCleanupDialog(null);
        // 창의 건수는 목록을 받은 시점 값이다 — 실제 처리 건수는 응답으로 알린다.
        addToast(pendingCleanupResultMessage(cleanupResult));
      },
      onError: (mutationError) => {
        // 409 두 종류(상태가 바뀜·동시 수정) 모두 서버 문구 그대로. 목록은 훅의 onSettled 가 다시 받는다.
        const message =
          mutationError instanceof ApiError
            ? mutationError.message
            : '남은 미결을 정리하지 못했어요. 잠시 후 다시 시도해 주세요.';
        setCleanupError(message);
      },
      // 성공·실패 모두 풀어 실패 뒤 다시 시도·창을 다시 열어 확정할 수 있게 한다.
      onSettled: () => {
        isConfirmSubmittingRef.current = false;
      },
    });
  }

  function handlePendingCleanupCancel() {
    setCleanupDialog(null);
    setCleanupError(null);
  }

  function handleCentralClubToggleClick(club: AdminClubSummary) {
    setCentralClubError(null);
    setCentralClubDialog(club);
  }

  function handleCentralClubConfirm() {
    if (!centralClubDialog || isConfirmSubmittingRef.current) return;
    setCentralClubError(null);
    isConfirmSubmittingRef.current = true;
    centralClubMutation.mutate(
      { clubId: centralClubDialog.id, payload: { centralClub: !centralClubDialog.centralClub } },
      {
        onSuccess: () => setCentralClubDialog(null),
        onError: (mutationError) => {
          const message =
            mutationError instanceof ApiError ? mutationError.message : '처리에 실패했습니다.';
          setCentralClubError(message);
        },
        onSettled: () => {
          isConfirmSubmittingRef.current = false;
        },
      },
    );
  }

  function handleSecuredTargetToggleClick(club: AdminClubSummary) {
    setSecuredTargetError(null);
    setSecuredTargetDialog(club);
  }

  function handleSecuredTargetConfirm() {
    if (!securedTargetDialog || isConfirmSubmittingRef.current) return;
    setSecuredTargetError(null);
    isConfirmSubmittingRef.current = true;
    securedTargetMutation.mutate(
      {
        clubId: securedTargetDialog.id,
        payload: { facilitySecuredTimeTarget: !securedTargetDialog.facilitySecuredTimeTarget },
      },
      {
        onSuccess: () => setSecuredTargetDialog(null),
        onError: (mutationError) => {
          const message =
            mutationError instanceof ApiError ? mutationError.message : '처리에 실패했습니다.';
          setSecuredTargetError(message);
        },
        onSettled: () => {
          isConfirmSubmittingRef.current = false;
        },
      },
    );
  }

  function handleSecuredTargetCancel() {
    setSecuredTargetDialog(null);
    setSecuredTargetError(null);
  }

  function handleCentralClubCancel() {
    setCentralClubDialog(null);
    setCentralClubError(null);
  }

  const page0Based = clubsQuery.data?.page ?? 0;
  const totalPages = clubsQuery.data?.totalPages ?? 0;
  const hasNext = clubsQuery.data?.hasNext ?? false;
  const totalElements = clubsQuery.data?.totalElements ?? 0;
  // 롤백 가드 — signal 을 보냈는데 첫 행에 signalDetail 키가 없으면 신호를 모르는 옛 백엔드다(null 은 신호를 아는 새 백엔드 형식이라 가드를 켜지 않는다 — 옛 백엔드는 키가 없다).
  const firstListedClub = clubsQuery.data?.content[0];
  const isSignalUnsupported =
    signal !== undefined && firstListedClub !== undefined && firstListedClub.signalDetail === undefined;
  // 신호 줄 건수는 목록 기준 — 로딩·오류·0건이면 뺀다.
  const signalClubCount = clubsQuery.data && !clubsQuery.isError && totalElements > 0 ? totalElements : null;

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6">
        <p className="text-charcoal-3 text-xs font-semibold">총동연 콘솔</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">동아리 관리</h1>
      </header>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <AdminClubStatusFilter value={statusFilter} onChange={handleFilterChange} selectedTabRef={selectedTabRef} />
        <Link
          href={toRoute('/admin/clubs/new')}
          className="btn btn-primary rounded-full px-4 text-[13px]"
        >
          + 새 동아리 등록
        </Link>
      </div>

      <form onSubmit={handleKeywordSubmit} className="mb-4 flex gap-2">
        <input
          ref={searchInputRef}
          type="search"
          value={keywordDraft}
          onChange={(event) => setKeywordDraft(event.target.value)}
          placeholder="이름 또는 설명으로 검색"
          className="border-field bg-paper w-full max-w-sm rounded-md border px-3 py-2 text-sm"
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
            onClick={resetKeyword}
            className="text-charcoal-3 rounded-md px-2 py-2 text-xs hover:underline"
          >
            초기화
          </button>
        )}
      </form>

      {signal && (
        <SignalScopeLine
          signal={signal}
          clubCount={signalClubCount}
          isUnsupported={isSignalUnsupported}
          onClear={handleSignalClear}
        />
      )}

      {clubsQuery.isLoading && <LoadingGate className="min-h-0 py-10" label="동아리 목록 불러오는 중" />}
      {clubsQuery.isError && (
        <p className="text-coral-deep py-10 text-center text-sm">목록을 불러오지 못했습니다.</p>
      )}
      {isSignalUnsupported && (
        <p className="py-10 text-center text-sm text-charcoal-2">조건을 해제하면 운영 중 동아리 전체를 볼 수 있어요.</p>
      )}
      {clubsQuery.data && !isSignalUnsupported && (
        <>
          {/* 해요체 빈 문구는 전체 0건일 때만 — 건수는 있는데 이 쪽만 비면 표의 기존 빈 문구와 쪽수를 둔다(신호 줄 "N곳만"과 어긋나지 않게). */}
          {signal && clubsQuery.data.totalElements === 0 ? (
            <SignalEmptyState keyword={keyword.trim()} onKeywordReset={resetKeyword} />
          ) : (
            <AdminClubsTable
              clubs={clubsQuery.data.content}
              signal={signal}
              onActionClick={(club, action) => {
                setDialog({ club, action });
                setDialogError(null);
              }}
              onCentralClubToggleClick={handleCentralClubToggleClick}
              onSecuredTargetToggleClick={handleSecuredTargetToggleClick}
              onCloseClick={handleCloseClick}
              onPendingCleanupClick={handlePendingCleanupClick}
            />
          )}
          <footer className="mt-4 flex items-center justify-between text-xs text-charcoal-3">
            <span>총 {totalElements}곳</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  setPage((current) => Math.max(0, current - 1));
                  scrollToPaginatedListStart(event.currentTarget);
                }}
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
                onClick={(event) => {
                  setPage((current) => current + 1);
                  scrollToPaginatedListStart(event.currentTarget);
                }}
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
      {centralClubDialog && (
        <AdminClubCentralClubToggleDialog
          clubName={centralClubDialog.name}
          currentValue={centralClubDialog.centralClub}
          isPending={centralClubMutation.isPending}
          errorMessage={centralClubError}
          onConfirm={handleCentralClubConfirm}
          onCancel={handleCentralClubCancel}
        />
      )}
      {securedTargetDialog && (
        <AdminClubSecuredTargetToggleDialog
          clubName={securedTargetDialog.name}
          currentValue={securedTargetDialog.facilitySecuredTimeTarget}
          isPending={securedTargetMutation.isPending}
          errorMessage={securedTargetError}
          onConfirm={handleSecuredTargetConfirm}
          onCancel={handleSecuredTargetCancel}
        />
      )}
      {deleteDialog && (
        <AdminClubDeleteDialog
          club={deleteDialog}
          isPending={closeMutation.isPending}
          errorMessage={deleteError}
          onConfirm={handleCloseConfirm}
          onCancel={handleCloseCancel}
        />
      )}
      {cleanupDialog && (
        <AdminClubPendingCleanupDialog
          clubName={cleanupDialog.club.name}
          counts={cleanupDialog.counts}
          isPending={cleanupMutation.isPending}
          errorMessage={cleanupError}
          onConfirm={handlePendingCleanupConfirm}
          onCancel={handlePendingCleanupCancel}
        />
      )}
    </main>
  );
}

// 신호 화면의 링크·버튼 — 터치 높이 44px, 밝은 바탕이라 포커스 링은 ink(sage 는 대비 미달).
const SIGNAL_ACTION_CLASS =
  'inline-flex min-h-11 items-center rounded font-semibold text-ink underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';

/** 신호 줄(표 위 정적 안내 — live region 아님). 롤백 가드면 "조건은 지금 볼 수 없어요"와 해제만 쓴다(스펙 §8-3). */
function SignalScopeLine({
  signal,
  clubCount,
  isUnsupported,
  onClear,
}: {
  signal: AdminClubSignal;
  clubCount: number | null;
  isUnsupported: boolean;
  onClear: () => void;
}) {
  const signalName = SIGNAL_LABEL[signal];
  return (
    <div className="border-line bg-paper mb-4 rounded-md border px-4 text-sm text-charcoal-2">
      <p className="break-keep">
        {isUnsupported ? (
          `'${signalName}' 조건은 지금 볼 수 없어요`
        ) : (
          <>
            <strong className="font-semibold text-ink">{signalName}</strong> {signalScopeText(clubCount)}
          </>
        )}
        {' · '}
        <button type="button" aria-label={`'${signalName}' 조건 해제`} onClick={onClear} className={SIGNAL_ACTION_CLASS}>
          조건 해제
        </button>
      </p>
      {isUnsupported ? null : (
        <p className="break-keep pb-2 text-xs text-charcoal-3">
          {isContactSignal(signal) ? (
            <>
              {CONTACT_SIGNAL_GUIDE}
              {' · '}
              <Link href={toRoute('/admin/users')} className={SIGNAL_ACTION_CLASS}>
                회원 관리
              </Link>
            </>
          ) : (
            USAGE_SIGNAL_GUIDE[signal]
          )}
        </p>
      )}
    </div>
  );
}

/** 신호 화면의 빈 목록 — 홈 숫자와 받은 시각이 달라 어긋날 수 있음을 알린다. 같은 화면의 기존 합니다체 문구는 그대로 둔다. */
function SignalEmptyState({ keyword, onKeywordReset }: { keyword: string; onKeywordReset: () => void }) {
  return (
    <p className="border-line text-charcoal-3 break-words break-keep rounded-md border bg-white py-10 text-center text-sm">
      {keyword ? (
        <>
          {`'${keyword}' 검색 결과 중 해당하는 곳이 없어요`}
          {' · '}
          <button type="button" onClick={onKeywordReset} className={SIGNAL_ACTION_CLASS}>
            검색 초기화
          </button>
        </>
      ) : (
        '지금은 해당하는 동아리가 없어요. 홈 숫자는 조금 전 기준이에요.'
      )}
    </p>
  );
}
