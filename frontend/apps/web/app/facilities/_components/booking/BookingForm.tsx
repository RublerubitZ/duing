'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@duing/api';
import {
  useCreateFacilityBookingMutation,
  useManagedClubsQuery,
  usePurposePresetsQuery,
} from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { CreateFacilityBookingResult } from '@duing/types';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { toRoute } from '@/app/_lib/route';
import { TextLinesSkeleton } from '@/components/loading/Skeleton';
import type { SlotRange } from '../../_lib/bookingCalendar';
import { isApplicationDeadlinePassed, rangeLabel } from '../../_lib/bookingCalendar';
import { BookingConfirmDialog } from './BookingConfirmDialog';

const PURPOSE_MAX_LENGTH = 200;

// 대표 연락처 검증 — 서버(@Pattern)와 동일. 하이픈 유무 모두 허용한다(§2.1).
const CONTACT_PHONE_PATTERN = /^01[016789]-?\d{3,4}-?\d{4}$/;

type Props = {
  facilityId: number;
  facilityName: string;
  date: string;
  range: SlotRange;
  hasPendingHold: boolean;
  onSubmitted: (result: CreateFacilityBookingResult, clubId: number) => void;
  onBack: () => void;
};

export function BookingForm({
  facilityId, facilityName, date, range, hasPendingHold, onSubmitted, onBack,
}: Props) {
  const authStatus = useAuthStore((state) => state.status);
  const authUser = useAuthStore((state) => state.user);
  const managedClubsQuery = useManagedClubsQuery({ enabled: authStatus === 'authenticated' });
  const presetsQuery = usePurposePresetsQuery();
  const createMutation = useCreateFacilityBookingMutation();
  const { addToast } = useToast();

  const purposeInputRef = useRef<HTMLInputElement>(null);
  const [clubId, setClubId] = useState<number | null>(null);
  const [purpose, setPurpose] = useState('');
  const [attendeeCount, setAttendeeCount] = useState('');
  // 로그인 프로필(/users/me)에 휴대폰 번호가 있으면 프리필(편집 가능). 없으면 빈 값 시작(§2.1).
  const [contactPhone, setContactPhone] = useState(() => authUser?.phone ?? '');
  const [contactError, setContactError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (authStatus !== 'authenticated') {
    // 로그인 후 현재 딥링크(?facilityId=&date=)로 복귀시킨다(next 검증은 로그인 쪽 toLinkRoute).
    const loginHref: `/${string}` =
      typeof window === 'undefined'
        ? '/login'
        : `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return (
      <div className="space-y-3 text-sm text-charcoal-2">
        <p>예약 신청은 동아리 운영진 로그인 후 이용할 수 있어요.</p>
        <Link href={toRoute(loginHref)} className="btn btn-primary inline-flex">로그인하기</Link>
      </div>
    );
  }

  // 신청 마감 사전 안내 — 표시용 힌트(클라 시계). 최종 판단은 서버가 한다(정책 spec 2026-07-18).
  if (isApplicationDeadlinePassed(date, new Date())) {
    return (
      <div className="space-y-3 text-sm text-charcoal-2">
        <p role="alert">이 날짜는 신청이 마감됐어요. 시설 사용일 전날 12:00까지만 신청할 수 있어요.</p>
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          시간 다시 선택
        </button>
      </div>
    );
  }

  if (managedClubsQuery.isPending) {
    return <TextLinesSkeleton lines={3} label="동아리 정보 불러오는 중" />;
  }
  if (managedClubsQuery.isError) {
    return (
      <div className="space-y-3 text-sm text-charcoal-2">
        <p role="alert">동아리 정보를 불러오지 못했어요.</p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void managedClubsQuery.refetch()}
        >
          다시 시도
        </button>
      </div>
    );
  }

  const managedClubs = managedClubsQuery.data ?? [];
  // 시설 예약은 중앙동아리만(정책 spec 2026-07-18). centralClub 미탑재 구버전 응답은 숨기지 않는다
  // (배포 전환기 fail-open — 알려진 false 만 제외). 최종 차단은 서버 403 이 한다.
  const centralClubs = managedClubs.filter((club) => club.centralClub !== false);
  if (managedClubsQuery.isSuccess && managedClubs.length === 0) {
    return (
      <p className="text-sm text-charcoal-2">
        운영진(회장·운영진)으로 소속된 동아리가 없어 신청할 수 없어요. 시설 예약은 동아리 단위로 신청됩니다.
      </p>
    );
  }
  if (managedClubsQuery.isSuccess && centralClubs.length === 0) {
    return (
      <p className="text-sm text-charcoal-2">
        시설 예약은 중앙동아리만 신청할 수 있어요. 운영 중인 중앙동아리가 없어 신청할 수 없어요.
      </p>
    );
  }

  const effectiveClubId = clubId ?? centralClubs[0]?.clubId ?? null;
  const selectedClub = centralClubs.find((club) => club.clubId === effectiveClubId) ?? null;
  const trimmedPurpose = purpose.trim();
  const trimmedContact = contactPhone.trim();
  const attendeeNumber = attendeeCount === '' ? undefined : Number(attendeeCount);
  const attendeeInvalid =
    attendeeNumber !== undefined && (!Number.isInteger(attendeeNumber) || attendeeNumber <= 0);
  // 대표 연락처는 확인 클릭 시점에 검증해 오류를 노출하므로(§2.2·§2.1) 트리거 활성 조건에선 제외한다.
  const canOpenConfirm =
    effectiveClubId !== null &&
    trimmedPurpose.length > 0 &&
    trimmedPurpose.length <= PURPOSE_MAX_LENGTH &&
    !attendeeInvalid &&
    !createMutation.isPending;

  // 폼 "예약 신청" — 즉시 전송하지 않고 대표 연락처 검증 통과 시 확인 Dialog 만 연다(§2.2).
  const openConfirm = () => {
    if (!canOpenConfirm) return;
    if (trimmedContact.length === 0) {
      setContactError('대표 연락처를 입력해주세요.');
      return;
    }
    if (!CONTACT_PHONE_PATTERN.test(trimmedContact)) {
      setContactError('휴대폰 번호 형식으로 입력해주세요.');
      return;
    }
    setContactError(null);
    setConfirmOpen(true);
  };

  // 실제 POST 는 확인 Dialog 의 [예약 신청]에서만 발사된다(§2.2).
  const submit = () => {
    if (effectiveClubId === null || createMutation.isPending) return;
    createMutation.mutate(
      {
        clubId: effectiveClubId,
        payload: {
          facilityId,
          date,
          startTime: range.start,
          endTime: range.end,
          purpose: trimmedPurpose,
          ...(attendeeNumber !== undefined ? { attendeeCount: attendeeNumber } : {}),
          contactPhone: trimmedContact,
        },
      },
      {
        onSuccess: (result) => {
          addToast('예약 신청이 접수되었어요.');
          setConfirmOpen(false);
          onSubmitted(result, effectiveClubId);
        },
        onError: (error) => {
          // 409/에러는 기존 경로 그대로 — Dialog 닫고 토스트(무효화는 mutation onSettled 가 처리).
          setConfirmOpen(false);
          addToast(
            error instanceof ApiError ? error.message : '신청에 실패했어요. 잠시 후 다시 시도해주세요.',
            { variant: 'error' },
          );
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs font-bold text-charcoal-3">사용 정보</p>
        <div className="rounded-md border border-line bg-cream/60 px-3 py-2 text-sm">
          <p className="font-medium text-ink-deep">{facilityName}</p>
          <p className="font-mono text-[13px] text-charcoal-2">{date} · {rangeLabel(range)}</p>
        </div>
      </div>

      {hasPendingHold && (
        <p role="alert" className="rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-xs text-coral">
          이미 예약 신청이 접수된 시간이 포함돼 있어요. 계속 신청할 수 있지만, 승인은 한 신청에만 됩니다.
        </p>
      )}

      {centralClubs.length > 1 && (
        <div>
          <label htmlFor="booking-club" className="mb-1 block text-xs text-charcoal-3">신청 동아리</label>
          <select
            id="booking-club"
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-base"
            value={String(effectiveClubId ?? '')}
            onChange={(event) => setClubId(Number(event.target.value))}
          >
            {centralClubs.map((club) => (
              <option key={club.clubId} value={club.clubId}>{club.clubName}</option>
            ))}
          </select>
        </div>
      )}
      {centralClubs.length === 1 && (
        <p className="text-xs text-charcoal-3">신청 동아리: <span className="text-charcoal">{centralClubs[0]?.clubName}</span></p>
      )}

      <div>
        <p className="mb-1 text-xs text-charcoal-3">사용 목적</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(presetsQuery.data ?? []).map((preset) => {
            const active = purpose === preset.label;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => setPurpose(preset.label)}
                className={`rounded-full border px-3 py-1.5 text-xs motion-safe:transition-colors ${
                  active ? 'border-ink bg-ink text-cream' : 'border-line bg-paper text-charcoal-2 hover:border-sage'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setPurpose('');
              purposeInputRef.current?.focus();
            }}
            className="rounded-full border border-dashed border-line bg-paper px-3 py-1.5 text-xs text-charcoal-3 hover:border-sage"
          >
            기타(직접 입력)
          </button>
        </div>
        <input
          ref={purposeInputRef}
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
          maxLength={PURPOSE_MAX_LENGTH}
          placeholder="사용 목적을 입력해주세요"
          aria-label="사용 목적"
          className="w-full rounded-md border border-line bg-paper px-3 py-2 text-base"
        />
      </div>

      <div>
        <label htmlFor="booking-attendees" className="mb-1 block text-xs text-charcoal-3">사용 인원 (선택)</label>
        <input
          id="booking-attendees"
          inputMode="numeric"
          value={attendeeCount}
          onChange={(event) => setAttendeeCount(event.target.value.replace(/[^0-9]/g, ''))}
          maxLength={4}
          placeholder="예: 15"
          className="w-full rounded-md border border-line bg-paper px-3 py-2 text-base"
        />
      </div>

      <div>
        <label htmlFor="booking-contact" className="mb-1 block text-xs text-charcoal-3">대표 연락처</label>
        <input
          id="booking-contact"
          inputMode="tel"
          value={contactPhone}
          onChange={(event) => {
            setContactPhone(event.target.value);
            if (contactError) setContactError(null);
          }}
          aria-label="대표 연락처"
          aria-invalid={contactError !== null}
          placeholder="연락 가능한 휴대폰 번호를 입력해주세요."
          className="w-full rounded-md border border-line bg-paper px-3 py-2 text-base"
        />
        <p className="mt-1 text-[11px] text-charcoal-3">
          관리자나 시설 담당자가 예약 관련 연락이 필요할 때 사용해요.
        </p>
        {contactError && <p role="alert" className="mt-1 text-[11px] text-coral">{contactError}</p>}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          className="btn btn-secondary flex-none"
          disabled={createMutation.isPending}
          onClick={onBack}
        >
          시간 다시 선택
        </button>
        <button type="button" className="btn btn-primary flex-1" disabled={!canOpenConfirm} onClick={openConfirm}>
          예약 신청
        </button>
      </div>

      <p className="text-center text-[11px] text-charcoal-3">신청 후 관리자 승인을 거쳐 확정돼요.</p>

      <BookingConfirmDialog
        open={confirmOpen}
        facilityName={facilityName}
        date={date}
        range={range}
        clubName={selectedClub?.clubName ?? ''}
        purpose={trimmedPurpose}
        attendeeCount={attendeeNumber}
        contactPhone={trimmedContact}
        isSubmitting={createMutation.isPending}
        onConfirm={submit}
        onCancel={() => {
          if (!createMutation.isPending) setConfirmOpen(false);
        }}
      />
    </div>
  );
}
