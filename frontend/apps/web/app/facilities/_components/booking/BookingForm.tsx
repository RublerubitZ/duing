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
import { formatPhone } from '@/app/_components/PhoneInput';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { toRoute } from '@/app/_lib/route';
import { useHydrated } from '@/app/_lib/useHydrated';
import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';
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
  const authStatus = useSeededAuthStatus();
  const authUser = useAuthStore((state) => state.user);
  const hydrated = useHydrated();
  const managedClubsQuery = useManagedClubsQuery({ enabled: authStatus === 'authenticated' });
  const presetsQuery = usePurposePresetsQuery();
  const createMutation = useCreateFacilityBookingMutation();
  const { addToast } = useToast();

  const purposeInputRef = useRef<HTMLInputElement>(null);
  const [clubId, setClubId] = useState<number | null>(null);
  const [purpose, setPurpose] = useState('');
  const [attendeeCount, setAttendeeCount] = useState('');
  // 로그인 프로필(/users/me)에 휴대폰 번호가 있으면 프리필(편집 가능). 없으면 빈 값 시작(§2.1).
  // 프리필 값도 표준 표기(010-1234-5678)로 맞춰 입력 중 포맷과 일관되게 한다.
  // 시드 부팅에서는 프로필이 이 폼보다 늦게 도착한다 — 마운트 시점 초기값만 잡으면 프리필이
  // 유실되므로, 사용자가 아직 손대지 않은 동안(null)은 프로필을 그대로 비춘다. 한 번 입력하면
  // (빈 문자열로 지운 경우 포함) 그 값이 이긴다.
  const [contactPhoneInput, setContactPhoneInput] = useState<string | null>(null);
  const contactPhone = contactPhoneInput ?? formatPhone(authUser?.phone ?? '');
  const [contactError, setContactError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // /facilities 는 A′ 라우트가 아니라 SSR/프리렌더 프레임이 스토어 초기값(미인증)으로 그려진다 —
  // 그 프레임에 로그인 안내를 실으면 로그인한 운영진에게 플래시로 보인다. 하이드레이션 전에는
  // 판정하지 않고 대기 표시만 둔다(상태 분기가 아니라 프레임 정합 — §8.1 과 무관).
  if (!hydrated) {
    return <TextLinesSkeleton lines={3} label="로그인 확인 중" />;
  }

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
  const attendeeValid = attendeeNumber !== undefined && !attendeeInvalid;
  // 6개 필수항목이 모두 입력돼야 버튼이 활성화된다(2026-07-21). 시설·날짜·시간은 props 로 이미 확정이고
  // 동아리·사용목적·사용인원·대표연락처가 입력값이다. 연락처는 "입력됨"(비어있지 않음)만 게이트로 두고,
  // 형식 오류는 확인 클릭 시점 메시지로 노출한다 — 미완성 번호에 버튼만 죽이면 이유를 알 수 없기 때문(§2.2).
  const canOpenConfirm =
    effectiveClubId !== null &&
    trimmedPurpose.length > 0 &&
    trimmedPurpose.length <= PURPOSE_MAX_LENGTH &&
    attendeeValid &&
    trimmedContact.length > 0 &&
    !createMutation.isPending;

  // 폼 "예약 신청" — 즉시 전송하지 않고 대표 연락처 형식 검증 통과 시 확인 Dialog 만 연다(§2.2).
  // 빈 연락처는 canOpenConfirm 게이트가 이미 버튼을 막으므로 여기선 형식만 본다(입력됨 → 형식 오류 메시지).
  const openConfirm = () => {
    if (!canOpenConfirm) return;
    if (!CONTACT_PHONE_PATTERN.test(trimmedContact)) {
      setContactError('휴대폰 번호 형식으로 입력해주세요.');
      return;
    }
    setContactError(null);
    setConfirmOpen(true);
  };

  // 실제 POST 는 확인 Dialog 의 [예약 신청]에서만 발사된다(§2.2).
  const submit = () => {
    // attendeeNumber 는 게이트(attendeeValid)를 통과해야 확인 Dialog 가 열리므로 여기선 항상 정의돼 있다.
    // 타입 좁힘 + 방어를 겸해 undefined 를 걸러낸다(사용 인원 필수화, 2026-07-21).
    if (effectiveClubId === null || attendeeNumber === undefined || createMutation.isPending) return;
    createMutation.mutate(
      {
        clubId: effectiveClubId,
        payload: {
          facilityId,
          date,
          startTime: range.start,
          endTime: range.end,
          purpose: trimmedPurpose,
          attendeeCount: attendeeNumber,
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
        <label htmlFor="booking-attendees" className="mb-1 block text-xs text-charcoal-3">사용 인원</label>
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
          inputMode="numeric"
          value={contactPhone}
          onChange={(event) => {
            // 숫자만 받아 010-1234-5678 로 자동 포맷(하이픈 자동, 11자리 초과 차단). MO 인증과 동일 유틸.
            setContactPhoneInput(formatPhone(event.target.value));
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
