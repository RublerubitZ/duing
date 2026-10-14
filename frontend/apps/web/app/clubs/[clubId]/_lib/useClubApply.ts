'use client';

import { useState } from 'react';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';
import type { StudentRecruitmentProjection } from '@duing/types';
import { ApiError } from '@duing/api';
import {
  CALENDAR_STALE_TIME_MS,
  useCheckEligibilityMutation,
  useMyApplicationsQuery,
} from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

import { useToast } from '@/app/_components/toast/ToastProvider';
import { safeExternalHref, toRoute } from '../../../_lib/route';

/** 지원 버튼이 기대는 상세 확인 상태 — ClubDetailPage 가 상세 쿼리로 만든다. */
export type ClubDetailCheck = {
  /** 이 브라우저가 상세를 마지막으로 받은 시각(ms). 0 = ISR 스냅샷(아직 못 받음). */
  checkedAt: number;
  /** 스냅샷인데 다시 받기가 끝내 실패했다 — 버튼은 잠긴 채 새로고침을 안내한다. */
  checkFailed: boolean;
  /** 상세를 다시 받는다. 성공하면 true. */
  recheck: () => Promise<boolean>;
};

/**
 * 동아리 모집 지원 동작을 한곳에서 관리한다.
 * - 외부 폼 모집: 안전 검증된 URL 을 새 탭으로 연다.
 * - 내부 모집: 비로그인 시 next 파라미터를 붙여 로그인으로, 로그인 시 지원 가능 여부를
 *   먼저 확인한 뒤 지원 페이지로 이동한다(부적격이면 토스트로 사유를 알리고 머무른다).
 * - 지원 버튼은 이 브라우저가 받은 최신 상세로만 연다(detailCheck.checkedAt > 0). ISR 스냅샷의 모집 상태는 재생성 주기만큼
 *   낡아 마감한 모집도 열려 보이고, 외부 폼은 서버 확인 없이 열리므로 스냅샷으로 열면 마감 뒤 지원이 샌다.
 * - ISR 스냅샷으로 잠근 지원 가능 모집은 awaitingCheck 로 알려 버튼이 확인 중 스피너를 두게 한다.
 * - 외부 폼은 확인한 지 모집 축 신선도(CALENDAR_STALE_TIME_MS)보다 오래된 상세로 열지 않는다 — 누르면 먼저 다시 받고 바뀐 상태를 보여 준 뒤 한 번 더 누르게 한다.
 *   일반 폼은 클릭 때 서버 자격 확인이 마감을 막지만, 외부 폼은 그 확인이 없다.
 * 데스크탑 모집 카드(ClubRecruitmentCard)와 모바일 하단 지원 바(ClubDetailApplyBar)가 공유한다.
 */
export function useClubApply(
  recruitment: StudentRecruitmentProjection | undefined,
  detailCheck: ClubDetailCheck,
) {
  const authStatus = useSeededAuthStatus();
  const router = useGuardedRouter();
  const { addToast } = useToast();
  const eligibilityCheck = useCheckEligibilityMutation();
  const [isRecheckingDetail, setIsRecheckingDetail] = useState(false);

  const status = recruitment?.displayStatus;
  const isSnapshot = detailCheck.checkedAt === 0;
  const isOpenStatus = status === 'OPEN' || status === 'ALWAYS_OPEN';
  const canApply = !isSnapshot && isOpenStatus;
  // 스냅샷이라 잠근 것뿐인 지원 가능 모집 — 확인되면 열릴 수 있다. 확인이 실패하지 않은 동안 버튼에 확인 중 스피너를 둔다(#1456).
  // 마감·예정·모집 없음은 카드 제목·하단 바 좌측 라벨이 이미 잠긴 이유를 말하므로 제외한다. 서버 HTML·하이드레이션 첫 프레임 모두 시드(updatedAt 0)라 같다.
  const awaitingCheck = isSnapshot && !detailCheck.checkFailed && isOpenStatus;
  const applyButtonLabel =
    recruitment?.applicationMode === 'EXTERNAL' ? '외부 폼으로 이동' : '지원하기';

  // 이미 지원한 모집이면 버튼 대신 지원서 보기로 보낸다. 'ALL' 인 이유: REJECTED 도 재지원 불가(BE 중복 검사는 상태 무관).
  // 미인증이면 훅이 스스로 disabled 라 요청이 나가지 않는다. 카드·하단 바 두 소비처는 이 값만 받는다(직접 쿼리 금지).
  const myApplications = useMyApplicationsQuery('ALL');
  const existingApplicationId =
    myApplications.data?.find((application) => application.recruitmentId === recruitment?.id)?.id ??
    null;

  async function handleApply() {
    if (!recruitment || !canApply || eligibilityCheck.isPending || isRecheckingDetail) return;
    if (recruitment.applicationMode === 'EXTERNAL' && recruitment.externalFormUrl) {
      // 기준은 모집 축 신선도(마감 노출 지연 상한)다 — 정책이 바뀌면 이 기준도 함께 바뀐다.
      // 확인한 지 오래된 상세면 열기 전에 다시 받는다. 받은 뒤 바로 열지 않는다 — 기다린 뒤의 window.open 은
      // 팝업 차단에 걸릴 수 있고(noopener 라 알 수도 없다), 바뀐 상태(마감 등)를 사용자가 먼저 보게 한다.
      if (Date.now() - detailCheck.checkedAt > CALENDAR_STALE_TIME_MS) {
        setIsRecheckingDetail(true);
        const rechecked = await detailCheck.recheck();
        setIsRecheckingDetail(false);
        if (rechecked) addToast('모집 정보를 새로 불러왔어요. 확인 후 다시 눌러 주세요.');
        else addToast('모집 정보를 확인하지 못했어요. 잠시 후 다시 시도해주세요.', { variant: 'error' });
        return;
      }
      const externalUrl = safeExternalHref(recruitment.externalFormUrl);
      if (externalUrl) window.open(externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const applyPath: `/${string}` = `/apply/${recruitment.id}`;
    const loginPath = toRoute(`/login?next=${encodeURIComponent(applyPath)}`);
    if (authStatus === 'unauthenticated') {
      router.push(loginPath);
      return;
    }
    try {
      // 지원서 작성 전에 제출과 동일한 정책으로 차단 사유를 미리 알려준다.
      // 아직 서버로 확인되지 않은 시드된 인증도 그대로 물어본다 — 만료된 access 는 API 레이어가
      // 갱신해 주고, 만료가 확정되면 전역 핸들러가 로그인으로 이동시킨다(여기서 이중 push 를 만들지
      // 않는다). 세션이 살아 있는 401 은 일시 장애다. 시드를 못 믿고 로그인 화면으로 먼저 보내면
      // 로그인한 사용자가 하드 로드 직후 지원을 시도할 때마다 튕긴다.
      await eligibilityCheck.mutateAsync(recruitment.id);
      router.push(toRoute(applyPath));
    } catch (checkError) {
      // 만료 확정이면 핸들러가 통지 시점에 동기로 스토어를 먼저 내리고 이동까지 맡는다.
      if (useAuthStore.getState().status === 'unauthenticated') return;
      const message =
        checkError instanceof ApiError
          ? checkError.message
          : '지원 가능 여부를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.';
      addToast(message, { variant: 'error' });
    }
  }

  // 버튼 자리 스피너의 접근 이름 — 진행 중인 확인이 없으면 null.
  const pendingLabel = isRecheckingDetail
    ? '모집 정보 확인 중'
    : eligibilityCheck.isPending
      ? '지원 자격 확인 중'
      : null;

  return {
    canApply,
    awaitingCheck,
    handleApply,
    applyButtonLabel,
    pendingLabel,
    existingApplicationId,
  };
}
