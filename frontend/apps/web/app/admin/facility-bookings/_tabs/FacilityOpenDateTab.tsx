'use client';

import { useState } from 'react';
import { ApiError } from '@duing/api';
import {
  useAdminFacilitiesQuery,
  useUpdateAllFacilityBookingOpenDateMutation,
  useUpdateFacilityBookingOpenDateMutation,
} from '@duing/hooks';
import type { AdminFacility } from '@duing/types';

import { Skeleton } from '@/components/loading/Skeleton';
import { monthDayLabel } from '@/app/facilities/_lib/bookingHome';
import { ConsoleCard } from '../../_components/ConsoleCard';
import { EmptyState } from '../../_components/EmptyState';
import { ErrorState } from '../../_components/ErrorState';
import { FacilityOpenDateConfirmDialog } from '../_components/FacilityOpenDateConfirmDialog';

// BookingManagementTab 의 기간 필터와 같은 날짜 입력 외형 — 관리자 콘솔 안에서 폼 컨트롤이 갈라지지 않게 한다.
const DATE_INPUT_CLASS =
  'rounded-[10px] border border-line bg-paper px-3 py-[7px] text-[13px] text-charcoal';
const CLOSED_LABEL = '닫힘';

/** 예약 창의 저장값 — 빈 입력은 null 로 접힌다(오픈일 null = 닫힘, 마감일 null = 상한 없음). */
type WindowValue = { open: string | null; close: string | null };
/** 편집 중인 입력값 — date input 은 빈 값을 빈 문자열로 다룬다. */
type WindowDraft = { open: string; close: string };

/** 확인 다이얼로그가 떠 있는 동안 붙잡아 두는 변경안 — `after` 가 둘 다 null 이면 닫기다. */
type PendingChange =
  | {
      scope: 'facility';
      facilityId: number;
      roomName: string;
      before: WindowValue;
      after: WindowValue;
    }
  | { scope: 'all'; facilityCount: number; after: WindowValue };

/** 다이얼로그용 창 표기 — 마감일이 없으면 뒤를 비워 "상한(익월 말일)까지"를 뜻한다. */
function windowLabel({ open, close }: WindowValue): string {
  if (open === null) return CLOSED_LABEL;
  return close === null ? `${monthDayLabel(open)} ~` : `${monthDayLabel(open)} ~ ${monthDayLabel(close)}`;
}

const toWindowValue = (draft: WindowDraft): WindowValue => ({
  open: draft.open === '' ? null : draft.open,
  close: draft.close === '' ? null : draft.close,
});

function errorMessageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : '처리에 실패했습니다.';
}

/**
 * 시설별 예약 창 설정 탭(오픈일 정책 §6.2 · 마감일 C9) — 시설마다 신청을 여는 날짜와 닫는 날짜를 정한다.
 * 오픈일을 비우면(닫기) 신청을 받지 않고, 마감일을 비우면 상한(익월 말일)까지 열린다.
 * 전체 적용은 시설별 PATCH 를 순차로 돌리지 않고 일괄 엔드포인트를 한 번 호출한다 — 서버가 단일 트랜잭션으로
 * 처리해 "절반만 열린" 중간 상태가 생기지 않는다(D8).
 * 오픈일 상한(오늘+1년)·마감일 순서/상한 검증은 서버가 하고, 화면은 실패 사유를 다이얼로그 안에 그대로 보여준다.
 */
export function FacilityOpenDateTab() {
  const [drafts, setDrafts] = useState<Record<number, WindowDraft>>({});
  const [bulkDraft, setBulkDraft] = useState<WindowDraft>({ open: '', close: '' });
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const facilitiesQuery = useAdminFacilitiesQuery();
  const facilityMutation = useUpdateFacilityBookingOpenDateMutation();
  const allMutation = useUpdateAllFacilityBookingOpenDateMutation();

  const facilities = facilitiesQuery.data ?? [];
  const draftOf = (facility: AdminFacility): WindowDraft => ({
    open: drafts[facility.id]?.open ?? facility.bookingOpenDate ?? '',
    close: drafts[facility.id]?.close ?? facility.bookingCloseDate ?? '',
  });

  // 한쪽 칸만 바꿔도 나머지는 현재값을 유지해야 하므로 초안은 항상 두 칸을 함께 채운 채로 갱신한다.
  function patchDraft(facility: AdminFacility, patch: Partial<WindowDraft>) {
    setDrafts((current) => {
      const base = current[facility.id] ?? {
        open: facility.bookingOpenDate ?? '',
        close: facility.bookingCloseDate ?? '',
      };
      return { ...current, [facility.id]: { ...base, ...patch } };
    });
  }

  function openDialog(change: PendingChange) {
    setPendingChange(change);
    setDialogError(null);
  }

  function closeDialog() {
    setPendingChange(null);
    setDialogError(null);
  }

  function handleConfirm() {
    if (pendingChange === null) return;
    setDialogError(null);

    // 부분 갱신이 아니라 바디가 곧 새 상태다 — 한쪽만 바꿔도 두 키를 함께 보낸다(C5).
    const payload = {
      bookingOpenDate: pendingChange.after.open,
      bookingCloseDate: pendingChange.after.close,
    };

    if (pendingChange.scope === 'all') {
      allMutation.mutate(payload, {
        onSuccess: () => {
          // 서버 값이 전부 덮였으므로 편집 중이던 초안은 버린다 — 재조회 결과가 곧 화면이다.
          setDrafts({});
          setBulkDraft({ open: '', close: '' });
          closeDialog();
        },
        onError: (error) =>
          setDialogError(`${errorMessageOf(error)}\n적용되지 않았어요. 다시 시도해 주세요.`),
      });
      return;
    }

    const { facilityId } = pendingChange;
    facilityMutation.mutate(
      { facilityId, payload },
      {
        onSuccess: () => {
          setDrafts((current) => {
            const next = { ...current };
            delete next[facilityId];
            return next;
          });
          closeDialog();
        },
        onError: (error) => setDialogError(errorMessageOf(error)),
      },
    );
  }

  return (
    <div className="space-y-4">
      <ConsoleCard className="flex flex-wrap items-center gap-2 px-[18px] py-3">
        <span className="text-[13px] font-bold text-ink-deep">전체 적용</span>
        <input
          type="date"
          aria-label="전체 적용 오픈일"
          value={bulkDraft.open}
          onChange={(event) => setBulkDraft((current) => ({ ...current, open: event.target.value }))}
          className={DATE_INPUT_CLASS}
        />
        <span aria-hidden className="text-[13px] text-charcoal-3">
          ~
        </span>
        <input
          type="date"
          aria-label="전체 적용 마감일"
          value={bulkDraft.close}
          onChange={(event) => setBulkDraft((current) => ({ ...current, close: event.target.value }))}
          className={DATE_INPUT_CLASS}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          // 마감일은 선택이다 — 오픈일만 있으면 상한(익월 말일)까지 여는 창으로 적용된다.
          disabled={bulkDraft.open === '' || facilities.length === 0}
          onClick={() =>
            openDialog({
              scope: 'all',
              facilityCount: facilities.length,
              after: toWindowValue(bulkDraft),
            })
          }
        >
          모든 시설에 적용
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={facilities.length === 0}
          onClick={() =>
            openDialog({
              scope: 'all',
              facilityCount: facilities.length,
              after: { open: null, close: null },
            })
          }
        >
          모든 시설 닫기
        </button>
      </ConsoleCard>

      <ConsoleCard>
        {facilitiesQuery.isPending && (
          <div className="space-y-3 p-6" aria-label="시설 목록 불러오는 중">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
        {facilitiesQuery.isError && (
          <ErrorState
            message="시설 목록을 불러오지 못했어요."
            onRetry={() => void facilitiesQuery.refetch()}
          />
        )}
        {facilitiesQuery.data !== undefined && facilities.length === 0 && (
          <EmptyState icon="🏫" title="시설이 없어요" body="학교 시설 동기화 후 다시 확인해 주세요." />
        )}
        {facilities.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead>
                <tr className="bg-graysoft text-[11.5px] font-bold tracking-[0.03em] text-charcoal-3">
                  <th className="px-[18px] py-2.5 font-bold">시설</th>
                  <th className="py-2.5 pr-3.5 font-bold">위치</th>
                  <th className="py-2.5 pr-3.5 font-bold">현재 예약 창</th>
                  <th className="py-2.5 pr-3.5 font-bold">새 예약 창</th>
                  <th className="py-2.5 pr-[18px] text-right font-bold">처리</th>
                </tr>
              </thead>
              <tbody>
                {facilities.map((facility) => {
                  const draft = draftOf(facility);
                  const current: WindowValue = {
                    open: facility.bookingOpenDate,
                    close: facility.bookingCloseDate,
                  };
                  // 현재값 셀만 원본 ISO 를 잇는다 — 관리자는 연도까지 확인한다(다이얼로그는 M.d 로 줄인다).
                  const currentText =
                    current.open === null
                      ? CLOSED_LABEL
                      : `${current.open} ~${current.close === null ? '' : ` ${current.close}`}`;
                  const changed =
                    draft.open !== (current.open ?? '') || draft.close !== (current.close ?? '');
                  return (
                    <tr key={facility.id} className="border-b border-line align-middle last:border-b-0">
                      <td className="px-[18px] py-[13px] text-sm font-bold text-ink-deep">
                        {facility.roomName}
                      </td>
                      <td className="py-[13px] pr-3.5 text-[13px] text-charcoal-2">
                        {facility.location ?? '—'}
                      </td>
                      <td className="whitespace-nowrap py-[13px] pr-3.5 tabular-nums text-[13px] text-charcoal">
                        {currentText}
                      </td>
                      <td className="py-[13px] pr-3.5">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="date"
                            aria-label={`${facility.roomName} 오픈일`}
                            value={draft.open}
                            onChange={(event) => patchDraft(facility, { open: event.target.value })}
                            className={DATE_INPUT_CLASS}
                          />
                          <span aria-hidden className="text-[13px] text-charcoal-3">
                            ~
                          </span>
                          <input
                            type="date"
                            aria-label={`${facility.roomName} 마감일`}
                            value={draft.close}
                            onChange={(event) => patchDraft(facility, { close: event.target.value })}
                            className={DATE_INPUT_CLASS}
                          />
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-[13px] pr-[18px] text-right">
                        <button
                          type="button"
                          aria-label={`${facility.roomName} 오픈일 저장`}
                          className="btn btn-primary btn-sm"
                          // 둘 다 비우는 건 저장이 아니라 닫기다 — 그 조합은 닫기 버튼으로만 보낸다.
                          disabled={(draft.open === '' && draft.close === '') || !changed}
                          onClick={() =>
                            openDialog({
                              scope: 'facility',
                              facilityId: facility.id,
                              roomName: facility.roomName,
                              before: current,
                              after: toWindowValue(draft),
                            })
                          }
                        >
                          저장
                        </button>
                        {/* 닫기는 이미 닫힌 시설에 보여줄 이유가 없다 — null → null 은 아무 일도 하지 않는다. */}
                        {facility.bookingOpenDate !== null && (
                          <button
                            type="button"
                            aria-label={`${facility.roomName} 오픈일 닫기`}
                            className="btn btn-ghost btn-sm ml-1.5"
                            onClick={() =>
                              openDialog({
                                scope: 'facility',
                                facilityId: facility.id,
                                roomName: facility.roomName,
                                before: current,
                                after: { open: null, close: null },
                              })
                            }
                          >
                            닫기
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ConsoleCard>

      {pendingChange !== null && (
        <FacilityOpenDateConfirmDialog
          title={
            pendingChange.scope === 'all'
              ? `활성 시설 ${pendingChange.facilityCount}개`
              : pendingChange.roomName
          }
          before={pendingChange.scope === 'all' ? '여러 값' : windowLabel(pendingChange.before)}
          after={windowLabel(pendingChange.after)}
          isPending={
            pendingChange.scope === 'all' ? allMutation.isPending : facilityMutation.isPending
          }
          errorMessage={dialogError}
          onConfirm={handleConfirm}
          onCancel={closeDialog}
        />
      )}
    </div>
  );
}
