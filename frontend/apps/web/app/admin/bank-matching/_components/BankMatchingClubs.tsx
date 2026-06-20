'use client';

import { useMemo, useState } from 'react';

import { ApiError } from '@duing/api';
import { useAdminBankMatchingQuery, useSetBankMatchingMutation } from '@duing/hooks';
import type { BankMatchingClub, BankMatchingSlots } from '@duing/types';

import { useToast } from '@/app/_components/toast/ToastProvider';
import { bankLabel } from '@/app/_lib/feeLabels';

function mutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export function BankMatchingClubs() {
  const { data, isLoading, isError } = useAdminBankMatchingQuery();
  const [search, setSearch] = useState('');

  const clubs = data?.clubs ?? [];
  const slots = data?.slots ?? null;

  // 클럽 이름 클라이언트 필터. 공백/대소문자를 무시해 입력 부담을 줄인다.
  const filteredClubs = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return clubs;
    return clubs.filter((club) => club.clubName.toLowerCase().includes(keyword));
  }, [clubs, search]);

  return (
    <div className="space-y-5">
      <SlotStatusHeader slots={slots} isLoading={isLoading} isError={isError} />

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="동아리 이름으로 검색"
        aria-label="동아리 이름 검색"
        className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-charcoal-3 focus:border-charcoal-1 focus:outline-none"
      />

      {isLoading ? (
        <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>
      ) : isError ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
          <p className="text-sm text-charcoal-2">
            동아리 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
          </p>
        </div>
      ) : clubs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
          <p className="text-sm text-charcoal-2">표시할 동아리가 없습니다.</p>
        </div>
      ) : filteredClubs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
          <p className="text-sm text-charcoal-2">검색 결과가 없습니다.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredClubs.map((club) => (
            <BankMatchingClubRow key={club.clubId} club={club} slots={slots} />
          ))}
        </ul>
      )}
    </div>
  );
}

type SlotStatusHeaderProps = {
  slots: BankMatchingSlots | null;
  isLoading: boolean;
  isError: boolean;
};

function SlotStatusHeader({ slots, isLoading, isError }: SlotStatusHeaderProps) {
  if (isLoading || isError) {
    return null;
  }

  // BANK API 일시 장애로 슬롯 현황만 비어 있을 수 있다(graceful degrade). 목록은 그대로 노출한다.
  if (slots === null) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-graysoft/40 px-4 py-3">
        <p className="text-sm text-charcoal-2">등록 현황을 일시적으로 불러올 수 없어요</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-graysoft/40 px-4 py-3">
      <p className="text-sm font-semibold text-ink">
        등록 {slots.registeredCount} / 최대 {slots.maxAccounts} · 남은 {slots.remaining}
      </p>
    </div>
  );
}

type BankMatchingClubRowProps = {
  club: BankMatchingClub;
  slots: BankMatchingSlots | null;
};

function BankMatchingClubRow({ club, slots }: BankMatchingClubRowProps) {
  const setBankMatching = useSetBankMatchingMutation();
  const { addToast } = useToast();

  const slotsFull = slots !== null && slots.remaining <= 0;
  // 등록 버튼은 적격하지 않거나 슬롯이 가득 찼을 때 비활성. 해제는 항상 허용한다.
  const registerDisabled = !club.eligible || slotsFull;
  const disabledHint = !club.eligible
    ? club.ineligibleReason ?? '등록할 수 없는 동아리예요'
    : slotsFull
      ? '한도 초과'
      : undefined;

  const setActive = (active: boolean) => {
    setBankMatching.mutate(
      { clubId: club.clubId, active },
      {
        onSuccess: () =>
          addToast(active ? '자동매칭에 등록했습니다.' : '자동매칭 등록을 해제했습니다.'),
        onError: (error) =>
          addToast(
            mutationErrorMessage(
              error,
              active ? '등록에 실패했습니다.' : '해제에 실패했습니다.',
            ),
            { variant: 'error' },
          ),
      },
    );
  };

  return (
    <li className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{club.clubName}</p>
        <p className="mt-0.5 truncate text-xs text-charcoal-2">
          {bankLabel(club.bank)} · {club.accountHolder} · {club.maskedAccountNumber ?? '계좌 확인 불가'}
        </p>
        <p className="mt-0.5 text-xs text-charcoal-3">
          {club.registered ? '자동매칭 활성' : '자동매칭 비활성'}
          {!club.eligible && club.ineligibleReason && (
            <span className="text-charcoal-3"> · {club.ineligibleReason}</span>
          )}
        </p>
      </div>

      {club.registered ? (
        <button
          type="button"
          onClick={() => setActive(false)}
          disabled={setBankMatching.isPending}
          className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-coral transition-colors hover:bg-coral/5 disabled:opacity-50"
        >
          해제
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setActive(true)}
          disabled={registerDisabled || setBankMatching.isPending}
          title={registerDisabled ? disabledHint : undefined}
          className="shrink-0 rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-paper transition-colors hover:bg-ink-deep disabled:opacity-50"
        >
          등록
        </button>
      )}
    </li>
  );
}
