'use client';

import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import type { StudentRecruitmentProjection } from '@duing/types';
import { ApiError } from '@duing/api';
import { useCheckEligibilityMutation } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

import { useToast } from '@/app/_components/toast/ToastProvider';
import { safeExternalHref, toRoute } from '../../../_lib/route';

/**
 * 동아리 모집 지원 동작을 한곳에서 관리한다.
 * - 외부 폼 모집: 안전 검증된 URL 을 새 탭으로 연다.
 * - 내부 모집: 비로그인 시 next 파라미터를 붙여 로그인으로, 로그인 시 지원 가능 여부를
 *   먼저 확인한 뒤 지원 페이지로 이동한다(부적격이면 토스트로 사유를 알리고 머무른다).
 * 데스크탑 모집 카드(ClubRecruitmentCard)와 모바일 하단 지원 바(ClubDetailApplyBar)가 공유한다.
 */
export function useClubApply(recruitment: StudentRecruitmentProjection | undefined) {
  const authStatus = useAuthStore((state) => state.status);
  const router = useGuardedRouter();
  const { addToast } = useToast();
  const eligibilityCheck = useCheckEligibilityMutation();

  const status = recruitment?.displayStatus;
  const canApply = status === 'OPEN' || status === 'ALWAYS_OPEN';
  const applyButtonLabel =
    recruitment?.applicationMode === 'EXTERNAL' ? '외부 폼으로 이동' : '지원하기';

  async function handleApply() {
    if (!recruitment || !canApply || eligibilityCheck.isPending) return;
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
    try {
      // 지원서 작성 전에 제출과 동일한 정책으로 차단 사유를 미리 알려준다.
      await eligibilityCheck.mutateAsync(recruitment.id);
      router.push(toRoute(applyPath));
    } catch (checkError) {
      const message =
        checkError instanceof ApiError
          ? checkError.message
          : '지원 가능 여부를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.';
      addToast(message, { variant: 'error' });
    }
  }

  return {
    canApply,
    handleApply,
    applyButtonLabel,
    isCheckingEligibility: eligibilityCheck.isPending,
  };
}
