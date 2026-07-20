'use client';

import { useState } from 'react';
import { ApiError } from '@duing/api';
import {
  formatDateTimeKst,
  useAdminFacilityBookingDetailQuery,
  useApproveFacilityBookingMutation,
  useCancelFacilityBookingAdminMutation,
  useConfirmFacilityBookingMutation,
  useMarkConflictFacilityBookingMutation,
  useRejectFacilityBookingMutation,
} from '@duing/hooks';
import type { AdminBookingOverlapItem, FacilityBookingConflictPayload } from '@duing/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { BookingStatusBadge } from '@/app/_components/BookingStatusBadge';
import {
  bookingDateLabel,
  bookingTimeLabel,
  BOOKING_STATUS_META,
} from '@/app/_lib/bookingDisplay';
import { crawlFreshnessLabel, isFacilityBookingConflictPayload } from '../_lib/adminBookingDisplay';
import { AdminSlotStrip } from './AdminSlotStrip';
import { BookingActionDialog } from './BookingActionDialog';

type ActionKind = 'approve' | 'reject' | 'confirm' | 'markConflict' | 'cancel';

const ACTION_META: Record<
  ActionKind,
  { title: string; description: string; reasonLabel: string | null; destructive: boolean; successMessage: string }
> = {
  approve: {
    title: '승인',
    description: '신청 시간대를 재검증한 뒤 승인합니다. 겹침이 있으면 승인되지 않아요.',
    reasonLabel: null,
    destructive: false,
    successMessage: '승인했어요. 학교 반영 후 자동 확정됩니다.',
  },
  reject: {
    title: '거절',
    description: '거절 사유는 신청 동아리에 그대로 표시됩니다.',
    reasonLabel: '거절 사유',
    destructive: true,
    successMessage: '거절했어요.',
  },
  confirm: {
    title: '수동 확정',
    description: '학교 반영을 직접 확인한 경우에만 확정하세요. 잘못 확정한 경우에는 취소로 되돌릴 수 있어요.',
    reasonLabel: null,
    destructive: false,
    successMessage: '확정했어요.',
  },
  markConflict: {
    title: '충돌 전환',
    description: '학교 일정과 충돌한 건으로 표시합니다. 상세는 동아리에 노출됩니다.',
    reasonLabel: '충돌 상세',
    destructive: true,
    successMessage: '충돌 상태로 전환했어요.',
  },
  cancel: {
    title: '취소',
    description: '승인·확정된 예약을 취소합니다. 사유는 동아리에 표시됩니다.',
    reasonLabel: '취소 사유',
    destructive: true,
    successMessage: '취소했어요.',
  },
};

/** 검증 3카드(개편 스펙 §3) — 슬롯 스트립을 해석하기 전에 겹침 검사 결론부터 보여준다. */
function ValidationCards({
  overlaps,
  overlappingPendingCount,
}: {
  overlaps: AdminBookingOverlapItem[];
  overlappingPendingCount: number;
}) {
  const checks = [
    { label: '학교 일정 겹침', count: overlaps.filter((item) => item.source === 'SCHOOL').length },
    { label: '내부 승인 예약 겹침', count: overlaps.filter((item) => item.source === 'INTERNAL').length },
    { label: '같은 시간대 대기', count: overlappingPendingCount },
  ];
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {checks.map((check) => (
          <div
            key={check.label}
            className={`rounded-md border px-2.5 py-2 ${
              check.count > 0 ? 'border-coral/40 bg-coral/5' : 'border-line bg-paper'
            }`}
          >
            <p className="text-[11px] text-charcoal-3">{check.label}</p>
            <p className={`mt-0.5 text-sm font-bold ${check.count > 0 ? 'text-coral' : 'text-ink'}`}>
              {check.count > 0 ? `⚠ ${check.count}건` : '없음'}
            </p>
          </div>
        ))}
      </div>
      {overlappingPendingCount > 0 && (
        <p className="mt-1.5 text-xs text-charcoal-3">승인 후 겹치는 대기 신청은 수동으로 거절해주세요.</p>
      )}
    </div>
  );
}

/** 충돌 패널 → 거절 바로가기의 사유 프리필(수정 가능) — 500자 상한은 요약부만 잘라 문장 끝을 보존한다. */
function conflictRejectReason(payload: FacilityBookingConflictPayload): string {
  const prefix = '학교 예약(';
  const suffix = ')과 시간이 겹쳐 승인이 어렵습니다.';
  const conflictSummary = payload.conflicts
    .map((conflict) => `${conflict.organization} ${conflict.start}~${conflict.end}`)
    .join(', ');
  const summaryBudget = 500 - prefix.length - suffix.length;
  return `${prefix}${conflictSummary.slice(0, summaryBudget)}${suffix}`;
}

type NeighborIds = { previous: number | null; next: number | null };

type Props = {
  bookingId: number;
  onClose: () => void;
  /** 현재 큐(필터·정렬 기준)의 이웃 예약 — onNavigate 와 함께 지정하면 헤더에 이전/다음 탐색을 노출(개편 스펙 §3). */
  neighborIds?: NeighborIds;
  onNavigate?: (bookingId: number) => void;
};

export function AdminBookingDetailModal({ bookingId, onClose, neighborIds, onNavigate }: Props) {
  const detailQuery = useAdminFacilityBookingDetailQuery(bookingId);
  const approveMutation = useApproveFacilityBookingMutation();
  const rejectMutation = useRejectFacilityBookingMutation();
  const confirmMutation = useConfirmFacilityBookingMutation();
  const markConflictMutation = useMarkConflictFacilityBookingMutation();
  const cancelMutation = useCancelFacilityBookingAdminMutation();
  const { addToast } = useToast();

  const [activeAction, setActiveAction] = useState<ActionKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [conflictPayload, setConflictPayload] = useState<FacilityBookingConflictPayload | null>(null);
  // 충돌 패널의 '충돌 사유로 거절' 바로가기가 채우는 사유 프리필 — 일반 거절 진입은 빈 값 유지.
  const [rejectPrefill, setRejectPrefill] = useState<string | null>(null);

  const detail = detailQuery.data;

  const mutationOf = (kind: ActionKind) =>
    kind === 'approve'
      ? approveMutation
      : kind === 'reject'
        ? rejectMutation
        : kind === 'confirm'
          ? confirmMutation
          : kind === 'markConflict'
            ? markConflictMutation
            : cancelMutation;

  const isActionPending =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    confirmMutation.isPending ||
    markConflictMutation.isPending ||
    cancelMutation.isPending;

  // 트리거 버튼 라벨과 확인 다이얼로그 제목·확정 버튼이 동일하도록 라벨 파생을 단일화
  // (CONFLICT 상태의 승인은 '재승인'으로 노출)
  const actionLabel = (kind: ActionKind) =>
    kind === 'approve' && detail?.status === 'CONFLICT' ? '재승인' : ACTION_META[kind].title;

  const runAction = (kind: ActionKind, reason: string) => {
    setActionError(null);
    setConflictPayload(null);
    const callbacks = {
      onSuccess: () => {
        addToast(ACTION_META[kind].successMessage);
        setActiveAction(null);
        setRejectPrefill(null);
      },
      onError: (error: unknown) => {
        if (
          error instanceof ApiError &&
          error.code === 'FACILITY_BOOKING_SCHOOL_CONFLICT' &&
          isFacilityBookingConflictPayload(error.payload)
        ) {
          setConflictPayload(error.payload);
          setActiveAction(null); // 확인 다이얼로그는 닫고 모달 본문의 충돌 패널로 안내
          return;
        }
        setActionError(error instanceof ApiError ? error.message : '처리에 실패했어요. 잠시 후 다시 시도해주세요.');
      },
    };
    if (kind === 'approve') approveMutation.mutate({ bookingId }, callbacks);
    else if (kind === 'confirm') confirmMutation.mutate({ bookingId }, callbacks);
    else if (kind === 'reject') rejectMutation.mutate({ bookingId, reason }, callbacks);
    else if (kind === 'markConflict') markConflictMutation.mutate({ bookingId, detail: reason }, callbacks);
    else cancelMutation.mutate({ bookingId, reason }, callbacks);
  };

  // §4.3 상태별 액션 매트릭스 — CONFIRMED 취소는 학교 측 취소·오확정 정정용 복구 경로(2026-07-17 감사 후속)
  const availableActions: ActionKind[] =
    detail?.status === 'PENDING'
      ? ['approve', 'reject']
      : detail?.status === 'APPROVED'
        ? ['confirm', 'markConflict', 'cancel']
        : detail?.status === 'CONFLICT'
          ? ['approve', 'cancel']
          : detail?.status === 'CONFIRMED'
            ? ['cancel']
            : [];
  const footerLeftActions: ActionKind[] =
    availableActions.length > 1
      ? availableActions.filter((kind) => kind === 'cancel' || kind === 'markConflict')
      : [];
  const footerRightActions = availableActions.filter((kind) => !footerLeftActions.includes(kind));

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next && !isActionPending) onClose();
        }}
      >
        <DialogContent
          className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>예약 신청 검토</DialogTitle>
            {/* 대기 건 연속 검토(개편 스펙 §3) — 모달을 닫지 않고 현재 큐의 이웃 예약으로 이동한다. */}
            {neighborIds !== undefined && onNavigate !== undefined && (
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={neighborIds.previous === null || isActionPending}
                  onClick={() => {
                    if (neighborIds.previous !== null) onNavigate(neighborIds.previous);
                  }}
                >
                  ← 이전
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={neighborIds.next === null || isActionPending}
                  onClick={() => {
                    if (neighborIds.next !== null) onNavigate(neighborIds.next);
                  }}
                >
                  다음 →
                </button>
              </div>
            )}
          </div>

          {detailQuery.isLoading && <LoadingGate className="min-h-0 py-8" label="예약 상세 불러오는 중" />}
          {detailQuery.isError && (
            <p role="alert" className="text-sm text-charcoal-2">
              상세를 불러오지 못했어요. 잠시 후 다시 시도해주세요.
            </p>
          )}

          {detail && (
            <div className="space-y-4">
              <div className="rounded-md border border-line bg-cream/60 px-3 py-3 text-sm">
                <p className="flex items-center justify-between gap-2 font-medium text-ink-deep">
                  <span>
                    {detail.clubName} · {detail.roomName}
                  </span>
                  <BookingStatusBadge status={detail.status} />
                </p>
                <p className="mt-1 font-mono text-[13px] text-charcoal-2">
                  {bookingDateLabel(detail.date)} {bookingTimeLabel(detail.startTime, detail.endTime)}
                </p>
                <p className="mt-1 text-charcoal-2">{detail.purpose}</p>
                {detail.attendeeCount !== undefined && (
                  <p className="mt-1 text-xs text-charcoal-3">사용 인원 {detail.attendeeCount}명</p>
                )}
                <p className="mt-1 text-xs text-charcoal-3">
                  <span>대표 연락처</span> <span className="text-charcoal-2">{detail.contactPhone ?? '—'}</span>
                </p>
                {detail.rejectReason && <p className="mt-1 text-xs text-charcoal-3">거절 사유 — {detail.rejectReason}</p>}
                {detail.conflictDetail && <p className="mt-1 text-xs text-coral">충돌 상세 — {detail.conflictDetail}</p>}
              </div>

              {/* 크롤 신선도(§5.2) — 승인은 저장된 스냅샷 기준 검증이므로 '재검증' 대신 사실대로 서술한다(개편 스펙 §3). */}
              <div
                role={detail.stale ? 'alert' : undefined}
                className={`rounded-md px-3 py-2 text-xs ${detail.stale ? 'bg-coral/10 text-coral' : 'bg-graysoft/60 text-charcoal-3'}`}
              >
                {detail.stale
                  ? `${crawlFreshnessLabel(detail.crawlBasisAt, new Date())} — 최신 크롤링을 확인하지 못했습니다. 마지막 수집 데이터를 기준으로 판단하세요.`
                  : `학교 데이터 기준 · ${crawlFreshnessLabel(detail.crawlBasisAt, new Date())} — 승인 시점에 이 데이터로 겹침을 검사합니다.`}
              </div>

              <ValidationCards overlaps={detail.overlaps} overlappingPendingCount={detail.overlappingPendingCount} />

              <AdminSlotStrip startTime={detail.startTime} endTime={detail.endTime} overlaps={detail.overlaps} />

              {/* 승인 409 충돌 패널(§8.3) */}
              {conflictPayload && (
                <div role="alert" className="rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-xs text-coral">
                  <p className="font-bold">학교 예약과 시간이 충돌하여 승인할 수 없습니다.</p>
                  <ul className="mt-1 space-y-0.5">
                    {conflictPayload.conflicts.map((conflict, index) => (
                      <li key={`${conflict.start}-${index}`}>
                        {conflict.organization} · {conflict.start}~{conflict.end}
                      </li>
                    ))}
                  </ul>
                  {conflictPayload.crawlBasisAt && (
                    <p className="mt-1">기준 수집 시각 {formatDateTimeKst(conflictPayload.crawlBasisAt)}</p>
                  )}
                  <p className="mt-1">겹침이 해소되기 전에는 승인할 수 없어요 — 아래 다른 액션으로 처리해주세요.</p>
                  {/* 거절 바로가기(개편 스펙 §3) — 충돌 내용을 사유로 프리필해 재입력을 줄인다. reject 가 가능한 상태(PENDING)에만 노출. */}
                  {availableActions.includes('reject') && (
                    <button
                      type="button"
                      className="btn btn-sm mt-2 rounded-[10px] bg-coral text-white"
                      disabled={isActionPending}
                      onClick={() => {
                        setRejectPrefill(conflictRejectReason(conflictPayload));
                        setActionError(null);
                        setActiveAction('reject');
                      }}
                    >
                      충돌 사유로 거절
                    </button>
                  )}
                </div>
              )}

              {actionError && (
                <p role="alert" className="rounded-md bg-coral/5 px-3 py-2 text-xs text-coral">
                  {actionError}
                </p>
              )}

              {detail.history.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-charcoal-3">처리 이력</p>
                  {/* 점+연결선 타임라인(개편 스펙 §3) — 데이터는 현행 유지(행위자 미노출 정책). */}
                  <ol className="text-xs text-charcoal-2">
                    {detail.history.map((item, index) => (
                      <li key={`${item.changedAt}-${index}`} className="flex gap-2.5 pb-2.5 last:pb-0">
                        <span aria-hidden className="flex flex-col items-center">
                          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-ink" />
                          {index < detail.history.length - 1 && <span className="w-px flex-1 bg-line" />}
                        </span>
                        <span className="flex flex-1 items-baseline justify-between gap-2">
                          <span>
                            {BOOKING_STATUS_META[item.newStatus].label}
                            {item.reason && <span className="text-charcoal-3"> — {item.reason}</span>}
                          </span>
                          <span className="shrink-0 text-charcoal-3">{formatDateTimeKst(item.changedAt)}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* 푸터 액션 — 파괴적 보조 액션(취소·충돌 전환)은 좌측, 주 액션은 우측 분리(개편 스펙 §3).
                  단독 액션(CONFIRMED 취소)은 그 상태의 주 액션이므로 우측에 남긴다. */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {footerLeftActions.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="btn btn-ghost btn-sm text-coral"
                    disabled={isActionPending}
                    onClick={() => {
                      setActionError(null);
                      setActiveAction(kind);
                    }}
                  >
                    {actionLabel(kind)}
                  </button>
                ))}
                <div className="ml-auto flex flex-wrap justify-end gap-2">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                    닫기
                  </button>
                  {footerRightActions.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className={`btn btn-sm ${ACTION_META[kind].destructive ? 'rounded-[10px] bg-coral text-white' : 'btn-primary'}`}
                      disabled={isActionPending}
                      onClick={() => {
                        setActionError(null);
                        setActiveAction(kind);
                      }}
                    >
                      {actionLabel(kind)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {activeAction !== null && (
        <BookingActionDialog
          open
          title={actionLabel(activeAction)}
          description={ACTION_META[activeAction].description}
          reasonLabel={ACTION_META[activeAction].reasonLabel}
          initialReason={activeAction === 'reject' ? (rejectPrefill ?? undefined) : undefined}
          isPending={mutationOf(activeAction).isPending}
          errorMessage={actionError}
          destructive={ACTION_META[activeAction].destructive}
          onConfirm={(reason) => runAction(activeAction, reason)}
          onClose={() => {
            if (!mutationOf(activeAction).isPending) {
              setActiveAction(null);
              setRejectPrefill(null);
            }
          }}
        />
      )}
    </>
  );
}
