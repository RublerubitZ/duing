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
import type { AdminBookingOverlapItem, BookingStatus, FacilityBookingConflictPayload } from '@duing/types';
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
      {/* 목업 FC2 checks — 종이 카드 3장, 이상 시 코럴 카드로 전환. */}
      <div className="grid grid-cols-3 gap-2.5">
        {checks.map((check) => (
          <div
            key={check.label}
            className={`rounded-[12px] border px-3.5 py-3 ${
              check.count > 0 ? 'border-[#E8B9A8] bg-[#FCE2D9]' : 'border-line bg-paper'
            }`}
          >
            <p className="text-[11.5px] text-charcoal-3">{check.label}</p>
            <p
              className={`mt-1 flex items-center gap-1.5 text-[13.5px] font-bold ${
                check.count > 0 ? 'text-[#9A3F23]' : 'text-ink'
              }`}
            >
              {check.count === 0 && (
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-[15px] w-[15px]"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
              {check.count > 0 ? `⚠ ${check.count}건` : '없음'}
            </p>
          </div>
        ))}
      </div>
      {overlappingPendingCount > 0 && (
        <p className="mt-2 text-xs text-charcoal-3">승인 후 겹치는 대기 신청은 수동으로 거절해주세요.</p>
      )}
    </div>
  );
}

/** 이력 점 톤(목업 FC2) — 문제 상태=coral, 확정=sage, 그 외=ink. */
function historyDotTone(status: BookingStatus): string {
  if (status === 'CONFLICT' || status === 'REJECTED' || status === 'CANCELLED') return 'bg-coral';
  if (status === 'CONFIRMED') return 'bg-sage';
  return 'bg-ink';
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
          className="flex max-h-[94dvh] w-[calc(100%-2rem)] max-w-[720px] flex-col gap-0 overflow-hidden rounded-[22px] p-0"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">예약 신청 검토</DialogTitle>

          {/* 목업 FC2 헤더 — 아바타 타일 + 동아리·번호·배지 + 한 줄 메타. 이전/다음은 헤더 우측(연속 검토). */}
          <div className="flex items-center gap-3.5 border-b border-line px-6 py-5">
            <span
              aria-hidden
              className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br from-ink to-ink-deep text-lg font-bold text-cream"
            >
              {detail?.clubName?.charAt(0) ?? '두'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-lg font-extrabold text-ink-deep">{detail?.clubName ?? '예약 신청 검토'}</span>
                {detail && <span className="font-mono text-xs text-charcoal-3">#{detail.bookingId}</span>}
                {detail && <BookingStatusBadge status={detail.status} />}
              </div>
              {detail && (
                <p className="mt-0.5 truncate text-[13px] text-charcoal-2">
                  {detail.roomName} · {bookingDateLabel(detail.date)}{' '}
                  {bookingTimeLabel(detail.startTime, detail.endTime)} · {detail.purpose}
                  {detail.attendeeCount !== undefined && ` · ${detail.attendeeCount}명`}
                  {` · 연락처 ${detail.contactPhone ?? '—'}`}
                </p>
              )}
            </div>
            {/* 대기 건 연속 검토(개편 스펙 §3) — 모달을 닫지 않고 현재 큐의 이웃 예약으로 이동한다. */}
            {neighborIds !== undefined && onNavigate !== undefined && (
              <div className="flex shrink-0 gap-1">
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

          <div className="flex-1 space-y-[18px] overflow-y-auto px-6 py-5">
            {detailQuery.isLoading && <LoadingGate className="min-h-0 py-8" label="예약 상세 불러오는 중" />}
            {detailQuery.isError && (
              <p role="alert" className="text-sm text-charcoal-2">
                상세를 불러오지 못했어요. 잠시 후 다시 시도해주세요.
              </p>
            )}

            {detail && (
              <>
                {detail.rejectReason && (
                  <p className="rounded-[12px] bg-graysoft px-3.5 py-2.5 text-xs text-charcoal-2">
                    거절 사유 — {detail.rejectReason}
                  </p>
                )}
                {detail.conflictDetail && (
                  <p className="rounded-[12px] bg-[#FCE2D9] px-3.5 py-2.5 text-xs text-[#9A3F23]">
                    충돌 상세 — {detail.conflictDetail}
                  </p>
                )}

                {/* 크롤 신선도(§5.2) — 승인은 저장된 스냅샷 기준 검증이므로 '재검증' 대신 사실대로 서술한다. */}
                <div
                  role={detail.stale ? 'alert' : undefined}
                  className={`flex items-center gap-2.5 rounded-[12px] px-3.5 py-3 text-[12.5px] leading-normal ${
                    detail.stale ? 'bg-[#FCE2D9] text-[#9A3F23]' : 'bg-sage-mist text-ink-deep'
                  }`}
                >
                  <span aria-hidden className="text-[15px]">
                    {detail.stale ? '⚠️' : '🛰'}
                  </span>
                  <span className="flex-1">
                    {detail.stale
                      ? `${crawlFreshnessLabel(detail.crawlBasisAt, new Date())} — 최신 크롤링을 확인하지 못했습니다. 마지막 수집 데이터를 기준으로 판단하세요.`
                      : `학교 데이터 기준 · ${crawlFreshnessLabel(detail.crawlBasisAt, new Date())} — 승인 시점에 이 데이터로 겹침을 검사합니다.`}
                  </span>
                </div>

                <div>
                  <p className="mb-2.5 text-[12.5px] font-bold text-charcoal-2">검증 컨텍스트 · 신청 시간 주변</p>
                  <AdminSlotStrip startTime={detail.startTime} endTime={detail.endTime} overlaps={detail.overlaps} />
                  <p className="mt-1.5 text-[11.5px] text-charcoal-3">
                    신청 슬롯 {bookingTimeLabel(detail.startTime, detail.endTime)} · 크롤(학교) + 내부 승인 예약을
                    함께 검사
                  </p>
                </div>

                <ValidationCards overlaps={detail.overlaps} overlappingPendingCount={detail.overlappingPendingCount} />

                {/* 승인 409 충돌 패널(목업 FC3) — 409 모노 칩 + 코럴 카드 + 거절 바로가기. */}
                {conflictPayload && (
                  <div
                    role="alert"
                    className="rounded-[14px] border-[1.5px] border-[#E8B9A8] bg-[#FCE2D9] px-[18px] py-4"
                  >
                    <p className="flex items-center gap-2 text-[13.5px] font-extrabold text-[#9A3F23]">
                      <span className="rounded-md bg-[#9A3F23] px-[7px] py-0.5 font-mono text-[11px] font-bold text-paper">
                        409
                      </span>
                      학교 예약과 시간이 충돌하여 승인할 수 없습니다.
                    </p>
                    <ul className="mt-2 space-y-0.5 text-[12.5px] leading-relaxed text-[#7E2A45]">
                      {conflictPayload.conflicts.map((conflict, index) => (
                        <li key={`${conflict.start}-${index}`}>
                          {conflict.organization} · {conflict.start}~{conflict.end}
                        </li>
                      ))}
                    </ul>
                    {conflictPayload.crawlBasisAt && (
                      <p className="mt-1 text-[12.5px] text-[#7E2A45]">
                        기준 수집 시각 {formatDateTimeKst(conflictPayload.crawlBasisAt)}
                      </p>
                    )}
                    <p className="mt-1 text-[12.5px] text-[#7E2A45]">
                      겹침이 해소되기 전에는 승인할 수 없어요 — 아래 다른 액션으로 처리해주세요.
                    </p>
                    {/* 거절 바로가기(개편 스펙 §3) — 충돌 내용을 사유로 프리필해 재입력을 줄인다. reject 가 가능한 상태(PENDING)에만 노출. */}
                    {availableActions.includes('reject') && (
                      <button
                        type="button"
                        className="btn btn-sm mt-3 rounded-[10px] bg-coral text-white hover:bg-coral/90"
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
                  <p role="alert" className="rounded-[12px] bg-coral/5 px-3.5 py-2.5 text-xs text-coral">
                    {actionError}
                  </p>
                )}

                {detail.history.length > 0 && (
                  <div>
                    <p className="mb-2.5 text-[12.5px] font-bold text-charcoal-2">처리 이력</p>
                    {/* 점+연결선 타임라인(목업 FC2) — 상태 톤 점 컬러, 데이터는 현행 유지(행위자 미노출 정책). */}
                    <ol>
                      {detail.history.map((item, index) => (
                        <li key={`${item.changedAt}-${index}`} className="flex gap-3">
                          <span aria-hidden className="flex flex-col items-center">
                            <span
                              className={`mt-1 h-[9px] w-[9px] shrink-0 rounded-full ${historyDotTone(item.newStatus)}`}
                            />
                            {index < detail.history.length - 1 && <span className="w-0.5 flex-1 bg-line" />}
                          </span>
                          <span
                            className={`flex flex-1 items-baseline justify-between gap-2 ${
                              index < detail.history.length - 1 ? 'pb-3.5' : ''
                            }`}
                          >
                            <span className="text-[13px] font-semibold text-ink-deep">
                              {BOOKING_STATUS_META[item.newStatus].label}
                              {item.reason && (
                                <span className="font-normal text-charcoal-3"> — {item.reason}</span>
                              )}
                            </span>
                            <span className="shrink-0 font-mono text-[11.5px] text-charcoal-3">
                              {formatDateTimeKst(item.changedAt)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 푸터 액션(목업 FC2) — 파괴적 보조 액션은 좌측 ghost coral, 주 액션은 우측.
              단독 액션(CONFIRMED 취소)은 그 상태의 주 액션이므로 우측에 남긴다. */}
          {detail && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-4">
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
                    className={`btn btn-sm ${
                      ACTION_META[kind].destructive
                        ? 'btn-secondary border-[#E8B9A8] text-coral hover:border-coral'
                        : 'btn-primary bg-ink-deep hover:bg-ink'
                    }`}
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
