'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import { ApiError } from '@duing/api';
import { useCreateJoinRequestMutation, useJoinCodeCheckQuery } from '@duing/hooks';
import { selectIsAuthenticated, useAuthStore } from '@duing/stores';

import { useToast } from '@/app/_components/toast/ToastProvider';
import { toRoute } from '@/app/_lib/route';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ButtonSpinner } from '@/components/loading/Spinner';

// 만료·폐기·소진·모집 마감·비 ACTIVE 동아리를 사유별로 구분하지 않는다 — BE 도 usable 하나로만
// 내려주고(스펙 6), 사유를 노출하면 코드 대입 시도자에게 동아리 상태를 알려주는 셈이 된다.
const INVALID_CODE_TITLE = '유효하지 않은 가입 코드입니다';

function LandingShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-cream px-5 py-12">
      <div className="w-full max-w-[420px] rounded-lg border border-line bg-paper p-6 text-center">
        {children}
      </div>
    </main>
  );
}

function ClubHeading({ clubName, generation }: { clubName: string; generation: number | null }) {
  return (
    <>
      <p className="text-sm text-charcoal-3">동아리 가입 초대</p>
      <h1 className="mt-1 text-xl font-bold text-ink-deep">{clubName}</h1>
      {generation !== null && (
        <p className="mt-1 text-sm text-charcoal-2">{generation}기로 가입해요</p>
      )}
    </>
  );
}

export function JoinCodeLanding({ code }: { code: string }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const { addToast } = useToast();
  const check = useJoinCodeCheckQuery(code);
  const createJoinRequest = useCreateJoinRequestMutation(code);

  async function requestJoin() {
    try {
      await createJoinRequest.mutateAsync();
      addToast('가입 요청을 보냈어요. 승인되면 알려드릴게요.');
    } catch (requestError) {
      // 409 사유(사용 불가 코드·이미 가입·대기 중 요청)는 서버 문구로만 구분된다 — 그대로 보여준다.
      addToast(
        requestError instanceof ApiError
          ? requestError.message
          : '가입 요청에 실패했어요. 잠시 후 다시 시도해주세요.',
        { variant: 'error' },
      );
    }
  }

  if (check.isPending) {
    return (
      <LandingShell>
        <LoadingGate label="가입 코드 확인 중" className="min-h-[8rem]" />
      </LandingShell>
    );
  }

  if (check.isError) {
    // 404 만 "없는 코드"다. 네트워크·서버 장애까지 코드 탓으로 안내하면 멀쩡한 코드를 버리게 된다.
    if (check.error instanceof ApiError && check.error.status === 404) {
      return (
        <LandingShell>
          <h1 className="text-lg font-bold text-ink-deep">{INVALID_CODE_TITLE}</h1>
          <p className="mt-2 text-sm text-charcoal-2">
            코드가 아직 유효한지 동아리에 확인해 주세요.
          </p>
        </LandingShell>
      );
    }
    return (
      <LandingShell>
        <h1 className="text-lg font-bold text-ink-deep">가입 코드를 확인하지 못했어요</h1>
        <p className="mt-2 text-sm text-charcoal-2">잠시 후 다시 시도해주세요.</p>
        <button type="button" onClick={() => void check.refetch()} className="btn btn-secondary mt-5 w-full">
          다시 시도
        </button>
      </LandingShell>
    );
  }

  const joinCode = check.data;

  // 아래 분기는 스펙 6 의 우선순위 순서다 — 가입·요청 상태가 코드 사용 가능 여부보다 앞선다.
  // 코드가 만료된 뒤 링크를 다시 연 회원에게 "유효하지 않은 코드"만 보여주면, 정작 알아야 할
  // 자기 상태(이미 가입됨·요청 대기 중)를 영영 확인할 수 없다.
  if (joinCode.alreadyMember) {
    return (
      <LandingShell>
        <ClubHeading clubName={joinCode.clubName} generation={joinCode.generation} />
        <p className="mt-4 text-sm font-semibold text-ink">이미 가입된 동아리입니다</p>
        <Link href={toRoute(`/clubs/${joinCode.clubId}`)} className="btn btn-secondary mt-5 w-full">
          동아리 페이지로 이동
        </Link>
      </LandingShell>
    );
  }

  if (joinCode.myRequestStatus === 'PENDING') {
    return (
      <LandingShell>
        <ClubHeading clubName={joinCode.clubName} generation={joinCode.generation} />
        <p className="mt-4 text-sm font-semibold text-ink">가입 요청 대기 중</p>
        <p className="mt-2 text-sm text-charcoal-2">
          동아리 운영진이 확인하면 회원으로 등록돼요.
        </p>
        {/* 대기 화면은 더 할 일이 없는 종결 화면이라 링크가 없으면 학생이 여기서 갇힌다. */}
        <Link href={toRoute('/')} className="btn btn-secondary mt-5 w-full">
          홈으로 돌아가기
        </Link>
      </LandingShell>
    );
  }

  if (!joinCode.usable) {
    return (
      <LandingShell>
        <h1 className="text-lg font-bold text-ink-deep">{INVALID_CODE_TITLE}</h1>
        <p className="mt-2 text-sm text-charcoal-2">코드가 아직 유효한지 동아리에 확인해 주세요.</p>
      </LandingShell>
    );
  }

  // 여기까지 온 나머지 — 이력 없음·거절·탈퇴 후 남은 승인 이력. 승인 이력을 종결 화면으로 취급하면
  // 탈퇴한 회원의 재가입을 프론트가 영구히 막게 되므로 모두 요청 가능으로 둔다(스펙 6).
  return (
    <LandingShell>
      <ClubHeading clubName={joinCode.clubName} generation={joinCode.generation} />
      <p className="mt-4 text-sm text-charcoal-2">
        가입 요청을 보내면 동아리 운영진 승인 후 회원으로 등록돼요.
      </p>
      {isAuthenticated ? (
        <button
          type="button"
          onClick={() => void requestJoin()}
          disabled={createJoinRequest.isPending}
          className="btn btn-primary mt-5 w-full"
        >
          {createJoinRequest.isPending && <ButtonSpinner />}
          가입 요청
        </button>
      ) : (
        <Link
          href={toRoute(`/login?next=${encodeURIComponent(`/join/${code}`)}`)}
          className="btn btn-primary mt-5 w-full"
        >
          로그인하고 가입 요청
        </Link>
      )}
    </LandingShell>
  );
}
