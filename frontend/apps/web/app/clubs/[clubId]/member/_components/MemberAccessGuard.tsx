'use client';

import { useEffect } from 'react';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { ApiError, httpFallbackMessage } from '@duing/api';
import { useClubMembershipQuery } from '@duing/hooks';
import type { MyClubMembership } from '@duing/types';
import { useOptionalToast } from '@/app/_components/toast/ToastProvider';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { MembershipProvider } from './MembershipContext';

type Props = { clubId: number; children: React.ReactNode };

const DEFAULT_DENIAL_MESSAGE = '회원 전용 페이지입니다.';

/**
 * 접근 거부면 사용자 안내 문구를, 통과 가능하거나 아직 판정 전이면 null 을 반환한다.
 *
 * 비멤버는 200 + null 로 도착하고(정상 응답), 403 은 실제 거부 사유(예: 운영 종료된 동아리),
 * 401 은 익명 딥링크(URL 레이어 인증, #838)다 — 익명은 hadLiveSession 이 없어 SessionExpiryHandler 가
 * 이동시키지 않으므로 여기서 거부로 판정해야 안내·리다이렉트가 일어난다.
 * 서버가 내려준 사유가 있으면 그대로 노출하고, 없을 때만 기본 문구로 폴백한다 —
 * 본문 파싱 실패 시 ApiError.message 는 합성 폴백("요청 실패 (403)")이라 사용자에게 보여선 안 된다.
 */
function resolveDenialMessage(
  membership: MyClubMembership | null | undefined,
  isLoading: boolean,
  error: unknown,
): string | null {
  if (isLoading) return null;
  // 거부 응답을 캐시된 멤버십보다 먼저 판정한다 — React Query 는 재조회가 실패해도 마지막 성공
  // data 를 남기므로, membership 을 먼저 보면 동아리가 폐쇄된 뒤에도 멤버 화면이 계속 렌더된다.
  if (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  ) {
    return error.status === 403 && error.message !== httpFallbackMessage(403)
      ? error.message
      : DEFAULT_DENIAL_MESSAGE;
  }
  if (membership === null) return DEFAULT_DENIAL_MESSAGE;
  // 네트워크 오류·5xx 는 거부가 아니다 — 리다이렉트 없이 재시도 여지를 남긴다.
  return null;
}

export function MemberAccessGuard({ clubId, children }: Props) {
  const router = useGuardedRouter();
  // 안내는 부가 피드백이고 본질은 리다이렉트다 — Provider 가 없어도 가드가 죽지 않도록 optional 접근자를 쓴다.
  const addToast = useOptionalToast();
  const { data: membership, isLoading, error } = useClubMembershipQuery(clubId);

  const denialMessage = resolveDenialMessage(membership, isLoading, error);

  useEffect(() => {
    if (!denialMessage) return;
    // ToastProvider 는 라우트 트리보다 위에 있어 이 컴포넌트가 언마운트돼도 안내가 살아남는다.
    // alert 과 달리 스레드를 막지 않고, 임베디드 브라우저에서 억제·throw 될 위험도 없다.
    addToast?.(`${denialMessage} 동아리 소개 페이지로 이동합니다.`, { variant: 'error' });
    router.replace(`/clubs/${clubId}`);
  }, [denialMessage, addToast, router, clubId]);

  if (isLoading) {
    return <LoadingGate label="권한 확인 중" />;
  }
  // 리다이렉트가 커밋되기 전 한 프레임 — 회원 전용 콘텐츠를 스치듯 노출하지 않도록 비운다.
  if (denialMessage) return null;
  // 거부가 아닌 실패(네트워크·5xx). 빈 화면으로 두면 거부와 구분되지 않으므로 상태를 알린다.
  if (!membership) {
    return <p className="p-6 text-sm text-coral">권한 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>;
  }

  return <MembershipProvider membership={membership}>{children}</MembershipProvider>;
}
