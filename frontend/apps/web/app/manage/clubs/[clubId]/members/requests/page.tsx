'use client';

import { use, useState } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { BulkApproveResult, JoinRequestStatus } from '@duing/types';
import { useBulkApproveJoinRequestsMutation, useJoinRequestsQuery } from '@duing/hooks';

import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';
import { JoinRequestTable } from './_components/JoinRequestTable';
import { JoinRequestDetailPanel } from './_components/JoinRequestDetailPanel';
import { BulkApproveResultDialog } from './_components/BulkApproveResultDialog';
import {
  JOIN_REQUEST_STATUSES,
  joinRequestEmptyMessage,
  joinRequestStatusLabel,
} from './_lib/joinRequestStatus';

// 권한 가드는 [clubId]/layout.tsx 의 ManageGuard 공통이라 이 페이지에는 두지 않는다.
export default function JoinRequestsPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const currentClubId = Number(clubIdParam);
  if (isNaN(currentClubId)) {
    notFound();
  }

  return <JoinRequestsView clubId={currentClubId} />;
}

function JoinRequestsView({ clubId }: { clubId: number }) {
  const [status, setStatus] = useState<JoinRequestStatus>('PENDING');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(() => new Set());
  const [detailId, setDetailId] = useState<number | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkApproveResult | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const requestsQuery = useJoinRequestsQuery(clubId, status);
  const bulkApprove = useBulkApproveJoinRequestsMutation(clubId);
  const { addToast } = useToast();

  const requests = requestsQuery.data ?? [];
  // 대기 중일 때만 선택·일괄 승인이 성립한다 — 이미 처리된 요청은 다시 승인할 수 없다.
  const selectable = status === 'PENDING';
  // 갱신으로 목록에서 빠진 요청의 선택은 조용히 흘리지 않고 렌더 시점에 걸러낸다.
  const visibleSelectedIds = requests
    .map((each) => each.joinRequestId)
    .filter((joinRequestId) => selectedIds.has(joinRequestId));

  function changeStatus(nextStatus: JoinRequestStatus) {
    setStatus(nextStatus);
    // 상태를 넘나들면 앞 탭의 선택·상세가 남아 남의 목록에 붙는다.
    setSelectedIds(new Set());
    setDetailId(null);
  }

  function toggleSelect(joinRequestId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(joinRequestId)) next.delete(joinRequestId);
      else next.add(joinRequestId);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      const everyVisibleSelected =
        requests.length > 0 && requests.every((each) => prev.has(each.joinRequestId));
      const next = new Set(prev);
      requests.forEach((each) => {
        if (everyVisibleSelected) next.delete(each.joinRequestId);
        else next.add(each.joinRequestId);
      });
      return next;
    });
  }

  async function approveSelected() {
    if (visibleSelectedIds.length === 0) return;
    setBulkError(null);
    try {
      const result = await bulkApprove.mutateAsync({ joinRequestIds: visibleSelectedIds });
      setSelectedIds(new Set());
      setDetailId(null);
      // 전부 성공하면 다이얼로그로 한 번 더 막지 않는다 — 확인할 실패 사유가 없다.
      if (result.failures.length === 0) {
        addToast(`${result.approvedCount}건을 승인했습니다.`);
        return;
      }
      setBulkResult(result);
    } catch (bulkFailure) {
      setBulkError(extractErrorMessage(bulkFailure) ?? '일괄 승인에 실패했어요.');
    }
  }

  const detailOpen = detailId !== null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <header>
        <Link
          href={toRoute(`/manage/clubs/${clubId}/members`)}
          className="text-sm font-medium text-charcoal-3 hover:text-ink"
        >
          ← 회원 관리
        </Link>
        <h1 className="mt-2 text-xl font-bold">가입 요청</h1>
        <p className="mt-1 text-sm text-charcoal-3">
          가입 코드로 접수된 요청을 확인하고 승인·거절합니다. 승인하면 바로 동아리 회원이 됩니다.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {JOIN_REQUEST_STATUSES.map((each) => (
          <button
            key={each}
            type="button"
            aria-pressed={status === each}
            onClick={() => changeStatus(each)}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
              status === each
                ? 'border-ink bg-ink text-paper'
                : 'border-line text-charcoal-2 hover:border-ink hover:text-ink',
            )}
          >
            {joinRequestStatusLabel(each)}
          </button>
        ))}
      </div>

      {selectable && visibleSelectedIds.length > 0 && (
        <div
          role="region"
          aria-label="가입 요청 일괄 작업"
          className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-graysoft/40 px-4 py-3"
        >
          <button
            type="button"
            onClick={approveSelected}
            disabled={bulkApprove.isPending}
            className="btn btn-primary btn-sm"
          >
            {bulkApprove.isPending && <ButtonSpinner />}
            선택 {visibleSelectedIds.length}건 일괄 승인
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="btn btn-ghost btn-sm"
          >
            선택 해제
          </button>
          {bulkError && (
            <p role="alert" className="text-sm text-coral">
              {bulkError}
            </p>
          )}
        </div>
      )}

      {requestsQuery.isLoading && <LoadingGate label="가입 요청 목록 불러오는 중" />}
      {requestsQuery.isError && (
        <p role="alert" className="py-12 text-center text-sm text-coral">
          {extractErrorMessage(requestsQuery.error) ?? '가입 요청을 불러오지 못했어요.'}
        </p>
      )}

      {requestsQuery.isSuccess && (
        <div
          className={
            detailOpen
              ? 'gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start'
              : undefined
          }
        >
          <div className="min-w-0">
            <JoinRequestTable
              requests={requests}
              selectable={selectable}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleAll={toggleAll}
              onOpenDetail={setDetailId}
              emptyMessage={joinRequestEmptyMessage(status)}
            />
          </div>
          {detailId !== null && (
            <div className="mt-4 lg:sticky lg:top-4 lg:mt-0">
              <JoinRequestDetailPanel
                // 요청이 바뀌면 본문을 새로 마운트한다 — 앞 요청의 실패 메시지가 다음 요청 화면에 남는다.
                key={detailId}
                clubId={clubId}
                joinRequestId={detailId}
                onClose={() => setDetailId(null)}
                onDecided={(decidedId) => {
                  setDetailId(null);
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    next.delete(decidedId);
                    return next;
                  });
                }}
              />
            </div>
          )}
        </div>
      )}

      {bulkResult !== null && (
        <BulkApproveResultDialog
          result={bulkResult}
          requests={requests}
          onClose={() => setBulkResult(null)}
        />
      )}
    </div>
  );
}
