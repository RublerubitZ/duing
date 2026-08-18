'use client';

import { ApiError } from '@duing/api';
import { useFavoriteIdsQuery, useFavoriteToggleMutation } from '@duing/hooks';
import posthog from 'posthog-js';

import { toRoute } from '@/app/_lib/route';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';

/**
 * 찜 토글의 공용 플로우 — 하트 버튼(FavoriteToggleButton)과 탐색 페이지 카드가 같은 동작
 * 계약을 공유한다. UI(하트 모양·배치)는 소비처가 각자 그리고, 여기는 동작만 담는다:
 *
 * ① 방향(찜/해제) 미확정 가드 — 찜 목록(ids)이 오기 전에는 찜한 동아리도 "찜 안 함" 으로 보여
 *    누르면 해제 대신 추가가 나가 409 로 조용히 실패한다. 방향을 모르는 동안은 토글을 막는다
 *    (§8.1 되돌릴 수 없는 동작). 미인증은 클릭이 로그인 이동이라 이 제약을 받지 않는다.
 * ② 미인증이면 현재 URL(쿼리스트링 포함)을 next 로 실어 로그인 이동 — 필터·페이지가 걸린
 *    화면에서 눌러도 로그인 후 그 자리로 돌아온다.
 * ③ 시드된 인증은 그대로 요청한다 — 만료된 access 는 API 계층이 갱신하고, 정말 미인증이면
 *    401 응답을 받은 뒤 로그인으로 보낸다.
 * ④ 성공 시 PostHog 이벤트(club_favorited/club_unfavorited) 발화 — 플로우에 내장해 진입
 *    경로(버튼/탐색 카드)와 무관하게 항상 잡힌다. 탐색 페이지 사본에서 이 이벤트가 누락돼
 *    찜 지표가 과소집계됐던 드리프트의 재발 방지.
 */
export function useFavoriteToggleFlow() {
  const router = useGuardedRouter();
  const authStatus = useSeededAuthStatus();
  const favoriteIdsQuery = useFavoriteIdsQuery();
  const toggleMutation = useFavoriteToggleMutation();

  const isDirectionUnknown = authStatus === 'authenticated' && favoriteIdsQuery.data === undefined;

  function isFavorited(clubId: number) {
    return favoriteIdsQuery.data?.includes(clubId) ?? false;
  }

  function toggle(clubId: number) {
    if (isDirectionUnknown) return;
    const currentUrl = window.location.pathname + window.location.search;
    const loginPath = toRoute(`/login?next=${encodeURIComponent(currentUrl)}`);
    if (authStatus === 'unauthenticated') {
      router.push(loginPath);
      return;
    }
    const currentlyFavorited = isFavorited(clubId);
    toggleMutation.mutate(
      { clubId, isFavorited: currentlyFavorited },
      {
        onSuccess: () => {
          posthog.capture(currentlyFavorited ? 'club_unfavorited' : 'club_favorited', {
            club_id: clubId,
          });
        },
        onError: (toggleError) => {
          if (toggleError instanceof ApiError && toggleError.status === 401) {
            router.push(loginPath);
            return;
          }
          console.error('찜 토글 실패:', toggleError);
        },
      },
    );
  }

  return {
    /** 방향(찜/해제) 미확정 — 하트 비활성 조건에 쓴다. toggle 자체도 이 동안은 무시된다. */
    isDirectionUnknown,
    isFavorited,
    isPending: toggleMutation.isPending,
    /** 목록형 화면에서 진행 중인 카드만 비활성으로 두기 위한 대상 clubId. */
    pendingClubId: toggleMutation.variables?.clubId,
    toggle,
  };
}
