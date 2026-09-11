'use client';

import type { BookingDayAvailability, CreateFacilityBookingResult } from '@duing/types';
import Link from 'next/link';
import { toRoute } from '@/app/_lib/route';
import { useHydrated } from '@/app/_lib/useHydrated';
import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';
import type { SlotRange } from '../../_lib/bookingCalendar';
import {
  hasApplicableSlot,
  rangeContainsPendingHold,
  rangeLabel,
} from '../../_lib/bookingCalendar';
import { BookingForm } from './BookingForm';
import { BookingSuccess } from './BookingSuccess';
import { DayBookingOverview } from './DayBookingOverview';
import { DaySlotList } from './DaySlotList';
import { PanelStepIndicator } from './PanelStepIndicator';

// 로그인 후 현재 딥링크(?facilityId=&date=)로 복귀시킨다(next 검증은 로그인 쪽 toLinkRoute). BookingForm 과 같은 규칙.
function guestLoginHref(): `/${string}` {
  return typeof window === 'undefined'
    ? '/login'
    : `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
}

export type PanelStep = 'slots' | 'form' | 'success';

// 주간 전용 사이드바의 일간 콘텐츠(§5) — 뷰 전환은 공용 헤더(BookingViewHeader)·주간 그리드는
// 본문(WeekTimetable)이 담당하므로 패널은 선택일의 요약·현황·시간 선택·신청 스텝만 렌더한다.
type Props = {
  facility: { id: number; roomName: string };
  day: BookingDayAvailability;
  selection: SlotRange | null;
  onToggleSlot: (slotStart: string) => void;
  step: PanelStep;
  onProceedToForm: () => void;
  onBackToSlots: () => void;
  submittedResult: CreateFacilityBookingResult | null;
  submittedClubId: number | null;
  submittedAt: string | null;
  onSubmitted: (result: CreateFacilityBookingResult, clubId: number) => void;
  onExploreOther: () => void;
  onClose: () => void;
};

export function BookingPanel({
  facility,
  day,
  selection,
  onToggleSlot,
  step,
  onProceedToForm,
  onBackToSlots,
  submittedResult,
  submittedClubId,
  submittedAt,
  onSubmitted,
  onExploreOther,
  onClose,
}: Props) {
  // 게스트 안내 — BookingForm.tsx 의 로그인 가드와 같은 문구·링크를 복제한다(원칙: 공용화 금지). 폼 쪽 가드는 딥링크 방어로 그대로 둔다.
  // 하이드레이션 전에는 판정하지 않는다 — SSR 프레임이 스토어 초기값(미인증)이라 로그인한 운영진에게 안내가 플래시된다.
  const hydrated = useHydrated();
  const authStatus = useSeededAuthStatus();
  const isGuest = hydrated && authStatus !== 'authenticated';
  const dateLabel = `${Number(day.date.slice(5, 7))}월 ${Number(day.date.slice(8, 10))}일`;

  if (step === 'success' && selection && submittedAt !== null) {
    return (
      <div>
        <div className="mb-3">
          <PanelStepIndicator step={step} />
        </div>
        <BookingSuccess
          facilityName={facility.roomName}
          date={day.date}
          range={selection}
          overlappingPendingCount={submittedResult?.overlappingPendingCount ?? 0}
          submittedAt={submittedAt}
          manageHref={
            submittedClubId !== null
              ? `/manage/clubs/${submittedClubId}/facility-bookings`
              : undefined
          }
          onExploreOther={onExploreOther}
          onClose={onClose}
        />
      </div>
    );
  }

  if (step === 'form' && selection) {
    return (
      <div>
        <div className="mb-3">
          <PanelStepIndicator step={step} />
        </div>
        <BookingForm
          facilityId={facility.id}
          facilityName={facility.roomName}
          date={day.date}
          range={selection}
          hasPendingHold={rangeContainsPendingHold(day.slots, selection)}
          onSubmitted={onSubmitted}
          onBack={onBackToSlots}
        />
      </div>
    );
  }

  // 선택 가능한 슬롯이 없는 날(마감·지난 날 기록 열람)은 "시간을 선택해주세요" 대신 사실을 말한다.
  const applicable = hasApplicableSlot(day);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2">
        <h3 className="text-ink-deep text-base">
          {facility.roomName} · {dateLabel}
        </h3>
      </div>

      <div className="mb-3">
        <PanelStepIndicator step={step} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <div className="space-y-3">
          <DayBookingOverview day={day} />
          {isGuest && (
            <div className="border-line bg-paper text-charcoal-2 space-y-3 rounded-lg border px-4 py-3 text-sm">
              <p>예약 신청은 동아리 운영진 로그인 후 이용할 수 있어요.</p>
              <Link href={toRoute(guestLoginHref())} className="btn btn-primary inline-flex">
                로그인하기
              </Link>
            </div>
          )}
          <DaySlotList day={day} selection={selection} onToggleSlot={onToggleSlot} />
        </div>
      </div>

      {/* 모바일(<md)은 아래 액션 바가 fixed 로 플로우를 떠나므로 자리 스페이서(BottomNav 전례). */}
      {/* 게스트는 진행 버튼·캡션이 없어 선택 칩이 있을 때만 바를 그린다 — 빈 띠가 탭바 위에 남지 않게. */}
      {(!isGuest || selection) && (
        <>
          <div aria-hidden className="h-36 md:hidden" />
          {/* bg-inherit 은 transparent 로 풀려 스크롤 중 뒤 슬롯이 비친다 — 패널·시트 공통 흰 계열로 고정.
          모바일(<md)은 sticky 가 BottomNav(fixed z-40, 60px+safe-area)에 가려진다 — 탭바 위에 fixed 로 띄워
          주간 화면 안에서 시간 선택→신청이 이어지는 상시 노출 액션 바로 동작한다(§모바일 주간). */}
          <div
            data-bottom-bar
            className="bg-paper max-md:border-line sticky bottom-0 pt-2 max-md:fixed max-md:inset-x-0 max-md:bottom-[calc(60px_+_env(safe-area-inset-bottom))] max-md:z-40 max-md:border-t max-md:px-4 max-md:pb-2"
          >
            {selection && (
              <div className="bg-sage-mist mb-2 flex items-center gap-2 rounded-lg px-3 py-2">
                <span className="text-ink-deep text-base font-bold tabular-nums">
                  {rangeLabel(selection)}
                </span>
                <span className="bg-ink text-cream ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold">
                  {Number(selection.end.slice(0, 2)) - Number(selection.start.slice(0, 2))}시간
                </span>
              </div>
            )}
            {/* 진행 캡션은 버튼과 한 쌍 — 버튼 없는 게스트에게 남으면 맥락 없는 안내가 된다. */}
            {!isGuest && (
              <>
                <button
                  type="button"
                  className="btn btn-primary w-full"
                  disabled={!selection}
                  onClick={onProceedToForm}
                >
                  {selection
                    ? `${rangeLabel(selection)} 예약 신청`
                    : applicable
                      ? '시간을 선택해주세요'
                      : '신청 가능한 시간이 없어요'}
                </button>
                <p className="text-charcoal-3 mt-2 text-center text-[11px]">
                  신청 후 관리자 승인을 거쳐 확정돼요.
                </p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
