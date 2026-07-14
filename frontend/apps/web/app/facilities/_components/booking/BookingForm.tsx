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
import type { SlotRange } from '../../_lib/bookingCalendar';
import { rangeLabel } from '../../_lib/bookingCalendar';

const PURPOSE_MAX_LENGTH = 200;

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
  const managedClubsQuery = useManagedClubsQuery({ enabled: authStatus === 'authenticated' });
  const presetsQuery = usePurposePresetsQuery();
  const createMutation = useCreateFacilityBookingMutation();
  const { addToast } = useToast();

  const purposeInputRef = useRef<HTMLInputElement>(null);
  const [clubId, setClubId] = useState<number | null>(null);
  const [purpose, setPurpose] = useState('');
  const [attendeeCount, setAttendeeCount] = useState('');

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

  if (managedClubsQuery.isPending) {
    return <p className="text-sm text-charcoal-3">동아리 정보를 불러오는 중…</p>;
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
  if (managedClubsQuery.isSuccess && managedClubs.length === 0) {
    return (
      <p className="text-sm text-charcoal-2">
        운영진(회장·운영진)으로 소속된 동아리가 없어 신청할 수 없어요. 시설 예약은 동아리 단위로 신청됩니다.
      </p>
    );
  }

  const effectiveClubId = clubId ?? managedClubs[0]?.clubId ?? null;
  const trimmedPurpose = purpose.trim();
  const attendeeNumber = attendeeCount === '' ? undefined : Number(attendeeCount);
  const attendeeInvalid =
    attendeeNumber !== undefined && (!Number.isInteger(attendeeNumber) || attendeeNumber <= 0);
  const canSubmit =
    effectiveClubId !== null &&
    trimmedPurpose.length > 0 &&
    trimmedPurpose.length <= PURPOSE_MAX_LENGTH &&
    !attendeeInvalid &&
    !createMutation.isPending;

  const submit = () => {
    if (!canSubmit || effectiveClubId === null) return;
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
        },
      },
      {
        onSuccess: (result) => {
          addToast('예약 신청이 접수되었어요.');
          onSubmitted(result, effectiveClubId);
        },
        onError: (error) => {
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

      {managedClubs.length > 1 && (
        <div>
          <label htmlFor="booking-club" className="mb-1 block text-xs text-charcoal-3">신청 동아리</label>
          <select
            id="booking-club"
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-base"
            value={String(effectiveClubId ?? '')}
            onChange={(event) => setClubId(Number(event.target.value))}
          >
            {managedClubs.map((club) => (
              <option key={club.clubId} value={club.clubId}>{club.clubName}</option>
            ))}
          </select>
        </div>
      )}
      {managedClubs.length === 1 && (
        <p className="text-xs text-charcoal-3">신청 동아리: <span className="text-charcoal">{managedClubs[0]?.clubName}</span></p>
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

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          className="btn btn-secondary flex-none"
          disabled={createMutation.isPending}
          onClick={onBack}
        >
          시간 다시 선택
        </button>
        <button type="button" className="btn btn-primary flex-1" disabled={!canSubmit} onClick={submit}>
          {createMutation.isPending ? '신청 중…' : '예약 신청'}
        </button>
      </div>

      <p className="text-center text-[11px] text-charcoal-3">신청 후 관리자 승인을 거쳐 확정돼요.</p>
    </div>
  );
}
