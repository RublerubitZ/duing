'use client';

import { useMemo, useState } from 'react';

import { ApiError } from '@duing/api';
import { useAdminBankMatchingQuery, useSetBankMatchingMutation } from '@duing/hooks';
import type { BankMatchingClub } from '@duing/types';

import { useToast } from '@/app/_components/toast/ToastProvider';
import { bankLabel } from '@/app/_lib/feeLabels';
import { LoadingGate } from '@/components/loading/LoadingGate';

function mutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }
  return fallback;
}

const OVERVIEW_FALLBACK_MESSAGE = '목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';

// 실패 원인을 구분해 안내한다 — 전부 "불러오지 못했어요" 로 뭉치면 로그인 만료인지 권한 문제인지
// 서버 장애인지 운영자가 알 수 없어 대응이 늦어진다.
function overviewErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return OVERVIEW_FALLBACK_MESSAGE;
  }
  // 네트워크·타임아웃은 api 계층이 이미 사용자 문구로 정규화해 두므로 그대로 쓴다.
  if (error.code === 'NETWORK' || error.code === 'TIMEOUT') {
    return error.message;
  }
  if (error.status === 401) {
    // 전역 세션 만료 안내(SessionExpiryHandler)와 같은 문장을 쓴다 — 같은 사건에 두 문구를 두지 않는다.
    return '세션이 만료되었어요. 다시 로그인해 주세요.';
  }
  if (error.status === 403) {
    return '총동연 계정으로만 볼 수 있는 화면이에요.';
  }
  if (error.status >= 500) {
    return '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
  }
  // 서버 문구가 비어 오면 빈 카드가 남으므로 폴백으로 채운다.
  return error.message.trim() || OVERVIEW_FALLBACK_MESSAGE;
}

export function BankMatchingClubs() {
  const { data, isLoading, isError, error, refetch } = useAdminBankMatchingQuery();
  const [search, setSearch] = useState('');

  const clubs = data?.clubs ?? [];
  // 숫자일 때만 현황을 노출한다 — 구버전 백엔드(필드 없음)와 붙었을 때 `?? 0` 이 "0개" 라고
  // 단정해 실제 등록 수를 거짓 표시하는 것을 막는다(배포 전환기 가드).
  const registeredCount = typeof data?.registeredCount === 'number' ? data.registeredCount : null;

  // 클럽 이름 클라이언트 필터. 공백/대소문자를 무시해 입력 부담을 줄인다.
  const filteredClubs = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return clubs;
    return clubs.filter((club) => club.clubName.toLowerCase().includes(keyword));
  }, [clubs, search]);

  // 목록이 이미 있으면 재조회 실패로 화면을 비우지 않는다 — 토글 직후 무효화가 일시 실패해도
  // 방금 본 목록이 에러 카드로 뒤바뀌지 않도록 한다.
  const showError = isError && !data;

  return (
    <div className="space-y-5">
      {!isLoading && registeredCount !== null && (
        <div className="rounded-xl border border-line bg-graysoft/40 px-4 py-3">
          <p className="text-sm font-semibold text-ink">자동매칭 등록 {registeredCount}개 동아리</p>
        </div>
      )}

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="동아리 이름으로 검색"
        aria-label="동아리 이름 검색"
        className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-charcoal-3 focus:border-charcoal-1 focus:outline-none"
      />

      {isLoading ? (
        <LoadingGate className="min-h-0 py-8" label="동아리 목록 불러오는 중" />
      ) : showError ? (
        <div
          role="alert"
          className="rounded-xl border border-dashed border-line px-6 py-10 text-center"
        >
          <p className="text-sm text-charcoal-2">{overviewErrorMessage(error)}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-graysoft/60"
          >
            다시 시도
          </button>
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
            <BankMatchingClubRow key={club.clubId} club={club} />
          ))}
        </ul>
      )}
    </div>
  );
}

type BankMatchingClubRowProps = {
  club: BankMatchingClub;
};

function BankMatchingClubRow({ club }: BankMatchingClubRowProps) {
  const setBankMatching = useSetBankMatchingMutation();
  const { addToast } = useToast();

  // 등록 버튼은 적격하지 않을 때만 비활성. 해제는 항상 허용한다.
  const registerDisabled = !club.eligible;
  const disabledHint = registerDisabled
    ? club.ineligibleReason ?? '등록할 수 없는 동아리예요'
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
          title={disabledHint}
          className="shrink-0 rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-paper transition-colors hover:bg-ink-deep disabled:opacity-50"
        >
          등록
        </button>
      )}
    </li>
  );
}
