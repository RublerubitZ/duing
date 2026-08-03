'use client';

import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { ApiError } from '@duing/api';
import { useAuthStore } from '@duing/stores';
import { useFavoriteIdsQuery, useFavoriteToggleMutation } from '@duing/hooks';

import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import posthog from 'posthog-js';

type Props = { clubId: number; size?: 'sm' | 'md'; className?: string };

export function FavoriteToggleButton({ clubId, size = 'md', className }: Props) {
  const router = useGuardedRouter();
  const status = useAuthStore((state) => state.status);
  const favoriteIdsQuery = useFavoriteIdsQuery();
  const toggleMutation = useFavoriteToggleMutation();

  const isFavorited = favoriteIdsQuery.data?.includes(clubId) ?? false;

  function handleClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    // 쿼리스트링까지 담아야 필터·페이지가 걸린 목록에서 눌러도 그 자리로 돌아온다.
    const currentUrl = window.location.pathname + window.location.search;
    const loginPath = toRoute(`/login?next=${encodeURIComponent(currentUrl)}`);
    if (status === 'unauthenticated') {
      router.push(loginPath);
      return;
    }
    // 세션 확인 중(idle)이면 미인증으로 단정하지 않고 그대로 요청한다 — 만료된 access 는 API
    // 레이어가 갱신하고, 정말 미인증이면 401 로 돌아온다. 확인 전에 로그인으로 튕기면 로그인한
    // 사용자가 하드 로드 직후 누른 찜이 매번 로그인 화면으로 이어진다.
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
      disabled={toggleMutation.isPending}
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