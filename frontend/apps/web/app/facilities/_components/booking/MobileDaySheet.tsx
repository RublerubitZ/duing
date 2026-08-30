'use client';

import { useRef } from 'react';
import type { BookingDayAvailability, CreateFacilityBookingResult } from '@duing/types';
import { bookingDateLabel } from '@/app/_lib/bookingDisplay';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { rangeContainsPendingHold, rangeLabel } from '../../_lib/bookingCalendar';
import { BookingForm } from './BookingForm';
import { BookingSuccess } from './BookingSuccess';
import type { PanelStep } from './BookingPanel';
import { DaySlotList } from './DaySlotList';
import { PanelStepIndicator } from './PanelStepIndicator';

type Facility = { id: number; roomName: string };

type Props = {
  open: boolean;
  facility: Facility | null;
  // 선택일 ISO — day(가용성) 로딩 전에도 시트 제목(접근 가능한 이름)을 제공한다.
  dateIso: string | null;
  day: BookingDayAvailability | null;
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
  onClose: () => void; // 시트 닫기(스와이프/외부 탭/Esc) — 월간 유지 + 선택 정리(closePanel 계열).
  onViewTimetable: () => void; // "시간표로 보기" — 시트 닫고 주간 전환(선택 유지).
};

/**
 * 모바일 빠른 예약 바텀시트(§11.1) — 월간 날짜 탭 시 주간 전환 대신 열려 시간 선택·신청을 한 시트에서 끝낸다.
 * 스텝·선택·제출 상태는 페이지가 소유(주간 사이드바와 공유) — 시트는 별도 상태 머신을 두지 않는다.
 * 빠른 선택에 집중해 다크 요약·현황 카드는 넣지 않는다(그 역할은 주간 뷰) — 헤더·스텝 인디케이터·슬롯 리스트·
 * sticky CTA(+"시간표로 보기")만. 신청 스텝(form·success)도 시트 안에서 진행한다(§11.1 item5).
 * 시트는 모바일 전용 마운트이고 열림은 월간 상태에서만이므로 주간 사이드바 폼과 id 이중 마운트가 없다.
 */
export function MobileDaySheet({
  open, facility, dateIso, day, selection, onToggleSlot,
  step, onProceedToForm, onBackToSlots, submittedResult, submittedClubId, submittedAt,
  onSubmitted, onExploreOther, onClose, onViewTimetable,
}: Props) {
  // 닫힘 애니메이션 동안 내용이 사라지지 않게 마지막 day/facility 스냅샷을 유지한다(WeekBlockSheet 전례).
  const lastDayRef = useRef(day);
  if (day !== null) lastDayRef.current = day;
  const shownDay = day ?? lastDayRef.current;
  const lastFacilityRef = useRef(facility);
  if (facility !== null) lastFacilityRef.current = facility;
  const shownFacility = facility ?? lastFacilityRef.current;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {/* 컨테이너 하단 패딩 0 — sticky 푸터가 스크롤 끝에서 정적 위치로 돌아갈 때 컨테이너 pb 가 푸터 아래
          여백으로 노출되던 문제. safe-area 포함 하단 여백은 각 스텝(푸터 없는 분기) 또는 푸터 자신이 갖는다. */}
      <SheetContent
        side="bottom"
        hideClose
        className="duing rounded-t-[26px] border-line bg-cream px-5 pb-0 pt-3"
      >
        <div className="mx-auto mb-3 h-[4.5px] w-10 rounded-full bg-line" />
        <SheetHeader className="mb-3">
          <SheetTitle>{shownDay !== null ? bookingDateLabel(shownDay.date) : dateIso !== null ? bookingDateLabel(dateIso) : '날짜 선택'}</SheetTitle>
          <SheetDescription className="sr-only">빠른 예약 — 날짜의 시간대를 골라 신청해요.</SheetDescription>
        </SheetHeader>

        {shownDay === null || shownFacility === null ? (
          <div className="pb-[calc(1.5rem_+_env(safe-area-inset-bottom))]">
            <ListRowsSkeleton
              rows={4}
              rowClassName="h-[44px] rounded-lg"
              className="space-y-2 py-4"
              label="시간대 불러오는 중"
            />
          </div>
        ) : !open ? (
          // 닫힘(exit 애니메이션 ~300ms) 중에는 폼/성공을 렌더하지 않는다 — 뷰포트 승계로 주간 사이드바가
          // 같은 커밋에 BookingForm 을 마운트하면 정적 id(booking-club 등)가 이중 마운트되는 것을 차단.
          // 슬롯 리스트(스냅샷 day)만 남겨 빈 시트로 내려가지 않게 한다(id 없는 콘텐츠).
          <div className="pb-[calc(1.5rem_+_env(safe-area-inset-bottom))]">
            <DaySlotList day={shownDay} selection={selection} onToggleSlot={onToggleSlot} />
          </div>
        ) : step === 'success' && selection !== null && submittedAt !== null ? (
          <div className="pb-[calc(1.5rem_+_env(safe-area-inset-bottom))]">
            <div className="mb-3">
              <PanelStepIndicator step={step} />
            </div>
            <BookingSuccess
              facilityName={shownFacility.roomName}
              date={shownDay.date}
              range={selection}
              overlappingPendingCount={submittedResult?.overlappingPendingCount ?? 0}
              submittedAt={submittedAt}
              manageHref={
                submittedClubId !== null ? `/manage/clubs/${submittedClubId}/facility-bookings` : undefined
              }
              onExploreOther={onExploreOther}
              onClose={onClose}
            />
          </div>
        ) : step === 'form' && selection !== null ? (
          <div className="pb-[calc(1.5rem_+_env(safe-area-inset-bottom))]">
            <div className="mb-3">
              <PanelStepIndicator step={step} />
            </div>
            <BookingForm
              facilityId={shownFacility.id}
              facilityName={shownFacility.roomName}
              date={shownDay.date}
              range={selection}
              hasPendingHold={rangeContainsPendingHold(shownDay.slots, selection)}
              onSubmitted={onSubmitted}
              onBack={onBackToSlots}
            />
          </div>
        ) : (
          <div>
            <div className="mb-3">
              <PanelStepIndicator step={step} />
            </div>
            <DaySlotList day={shownDay} selection={selection} onToggleSlot={onToggleSlot} />
            {/* bg-inherit 은 transparent 로 풀려 스크롤 중 뒤 슬롯이 비친다 — 시트 표면 bg-cream 으로 고정(패널 전례).
                하단 여백은 푸터 자신의 pb(safe-area 포함)로 — 컨테이너 pb-0 과 짝이라 화면 끝까지 배경이 이어진다. */}
            <div
              data-bottom-bar
              className="sticky bottom-0 -mx-5 mt-2 bg-cream px-5 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-2">
              {selection !== null && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-sage-mist px-3 py-2">
                  <span className="tabular-nums text-base font-bold text-ink-deep">{rangeLabel(selection)}</span>
                  <span className="ml-auto rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-cream">
                    {Number(selection.end.slice(0, 2)) - Number(selection.start.slice(0, 2))}시간
                  </span>
                </div>
              )}
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={selection === null}
                onClick={onProceedToForm}
              >
                {selection !== null ? `${rangeLabel(selection)} 예약 신청` : '시간을 선택해주세요'}
              </button>
              {/* "시간표로 보기"는 slots 스텝에서만 노출한다 — 폼·성공 중엔 시트→주간 전환 시 BookingForm id 가
                  주간 사이드바 폼과 이중 마운트될 수 있고, 이미 시간을 확정/신청한 뒤엔 시간표 조회 유도가 맥락에
                  맞지 않는다(§11.1). */}
              <button type="button" className="btn btn-ghost mt-2 w-full" onClick={onViewTimetable}>
                시간표로 보기
              </button>
              <p className="mt-1 text-center text-[11px] text-charcoal-3">신청 후 관리자 승인을 거쳐 확정돼요.</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
