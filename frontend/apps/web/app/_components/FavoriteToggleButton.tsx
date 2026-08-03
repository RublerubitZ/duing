'use client';

import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { ApiError } from '@duing/api';
import { useFavoriteIdsQuery, useFavoriteToggleMutation } from '@duing/hooks';

import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';
import posthog from 'posthog-js';

type Props = { clubId: number; size?: 'sm' | 'md'; className?: string };

export function FavoriteToggleButton({ clubId, size = 'md', className }: Props) {
  const router = useGuardedRouter();
  const status = useSeededAuthStatus();
  const favoriteIdsQuery = useFavoriteIdsQuery();
  const toggleMutation = useFavoriteToggleMutation();

  const isFavorited = favoriteIdsQuery.data?.includes(clubId) ?? false;
  // 찜 방향은 로드된 목록에 달려 있다 — 시드로 화면은 열되, ids 가 오기 전에는 찜한 동아리도
  // "찜 안 함" 으로 보여 누르면 해제 대신 추가가 나가고 409 로 조용히 실패한다. 방향을 모르는
  // 동안은 누르지 못하게 막는다(§8.1 되돌릴 수 없는 동작). 미인증이면 클릭이 로그인 이동이라
  // 방향과 무관하다 — 클릭 자체를 여는 지원하기와 달리 찜만 이 제약을 받는다.
  const isDirectionUnknown = status === 'authenticated' && favoriteIdsQuery.data === undefined;

  function handleClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (isDirectionUnknown) return;
    // 쿼리스트링까지 담아야 필터·페이지가 걸린 목록에서 눌러도 그 자리로 돌아온다.
    const currentUrl = window.location.pathname + window.location.search;
    const loginPath = toRoute(`/login?next=${encodeURIComponent(currentUrl)}`);
    if (status === 'unauthenticated') {
      router.push(loginPath);
      return;
    }
    // 확인이 끝난 뒤에도 access 가 만료됐을 수 있다 — 그건 API 레이어가 갱신하고, 정말 미인증이면
    // 401 로 돌아오므로 그때 로그인으로 보낸다.
    toggleMutation.mutate(
      { clubId, isFavorited },
      {
        onSuccess: () => {
          posthog.capture(isFavorited ? 'club_unfavorited' : 'club_favorited', { club_id: clubId });
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status === 401) {
            router.push(loginPath);
            return;
          }
          console.error('찜 토글 실패:', error);
        },
      },
    );
  }

  const dimensionClass = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isFavorited}
      aria-label={isFavorited ? '찜 해제' : '찜 추가'}
      className={cn(
        'inline-flex items-center justify-center rounded-full transition hover:bg-slate-100',
        dimensionClass,
        className,
      )}
      disabled={toggleMutation.isPending || isDirectionUnknown}
    >
      <HeartIcon filled={isFavorited} />
    </button>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
      />
    </svg>
  );
}