'use client';

import { useRouter } from 'next/navigation';
import type { StudentRecruitmentProjection } from '@duing/types';
import { useAuthStore } from '@duing/stores';

import { safeExternalHref, toRoute } from '../../../_lib/route';

/**
 * 동아리 모집 지원 동작을 한곳에서 관리한다.
 * - 외부 폼 모집: 안전 검증된 URL 을 새 탭으로 연다.
 * - 내부 모집: 비로그인 시 next 파라미터를 붙여 로그인으로, 로그인 시 지원 페이지로.
 * 데스크탑 모집 카드(ClubRecruitmentCard)와 모바일 하단 지원 바(ClubDetailApplyBar)가 공유한다.
 */
export function useClubApply(recruitment: StudentRecruitmentProjection | undefined) {
  const authStatus = useAuthStore((state) => state.status);
  const router = useRouter();

  const status = recruitment?.displayStatus;
  const canApply = status === 'OPEN' || status === 'ALWAYS_OPEN';
  const applyButtonLabel =
    recruitment?.applicationMode === 'EXTERNAL' ? '외부 폼으로 이동' : '지원하기';

  function handleApply() {
    if (!recruitment || !canApply) return;
    if (recruitment.applicationMode === 'EXTERNAL' && recruitment.externalFormUrl) {
      const externalUrl = safeExternalHref(recruitment.externalFormUrl);
      if (externalUrl) window.open(externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const applyPath: `/${string}` = `/apply/${recruitment.id}`;
    if (authStatus !== 'authenticated') {
      router.push(toRoute(`/login?next=${encodeURIComponent(applyPath)}`));
      return;
    }
    router.push(toRoute(applyPath));
  }

  return { canApply, handleApply, applyButtonLabel };
}
