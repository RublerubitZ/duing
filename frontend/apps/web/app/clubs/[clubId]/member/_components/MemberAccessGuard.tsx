'use client';

import { useEffect } from 'react';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { ApiError, httpFallbackMessage } from '@duing/api';
import { useClubMembershipQuery } from '@duing/hooks';
import type { MyClubMembership } from '@duing/types';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { MembershipProvider } from './MembershipContext';

type Props = { clubId: number; children: React.ReactNode };

const DEFAULT_DENIAL_MESSAGE = '회원 전용 페이지입니다.';

/**
 * 접근 거부면 사용자 안내 문구를, 통과 가능하거나 아직 판정 전이면 null 을 반환한다.
 *
 * 비멤버는 200 + null 로 도착하고(정상 응답), 남는 403 은 실제 거부 사유(예: 운영 종료된 동아리)다.
 * 서버가 내려준 사유가 있으면 그대로 노출하고, 없을 때만 기본 문구로 폴백한다 —
 * 본문 파싱 실패 시 ApiError.message 는 합성 폴백("요청 실패 (403)")이라 사용자에게 보여선 안 된다.
 */
function resolveDenialMessage(
  membership: MyClubMembership | null | undefined,
  isLoading: boolean,
  error: unknown,
): string | null {
  if (isLoading || membership) return null;
  if (membership === null) return DEFAULT_DENIAL_MESSAGE;
  // 네트워크 오류·5xx 는 거부가 아니다 — 리다이렉트 없이 재시도 여지를 남긴다.
  if (!(error instanceof ApiError) || (error.status !== 403 && error.status !== 404)) return null;
  return error.status === 403 && error.message !== httpFallbackMessage(403)
    ? error.message
    : DEFAULT_DENIAL_MESSAGE;
}

export function MemberAccessGuard({ clubId, children }: Props) {
  const router = useGuardedRouter();
  const { data: membership, isLoading, error } = useClubMembershipQuery(clubId);

  const denialMessage = resolveDenialMessage(membership, isLoading, error);

  useEffect(() => {
    if (!denialMessage) return;
    alert(`${denialMessage} 동아리 소개 페이지로 이동합니다.`);
    router.replace(`/clubs/${clubId}`);
  }, [denialMessage, router, clubId]);

  if (isLoading) {
    return <LoadingGate label="권한 확인 중" />;
  }
  if (!membership) return null;

  return <MembershipProvider membership={membership}>{children}</MembershipProvider>;
}
