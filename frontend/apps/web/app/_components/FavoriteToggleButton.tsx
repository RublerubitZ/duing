'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@duing/stores';
import { useFavoriteIdsQuery, useFavoriteToggleMutation } from '@duing/hooks';

import { cn } from '@/app/_lib/cn';

type Props = { clubId: number; size?: 'sm' | 'md'; className?: string };

export function FavoriteToggleButton({ clubId, size = 'md', className }: Props) {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const favoriteIdsQuery = useFavoriteIdsQuery();
  const toggleMutation = useFavoriteToggleMutation();

  const isFavorited = favoriteIdsQuery.data?.includes(clubId) ?? false;

  function handleClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (status !== 'authenticated') {
      const next = encodeURIComponent(window.location.pathname);
      router.push(`/login?next=${next}`);
      return;
    }
    toggleMutation.mutate(
      { clubId, isFavorited },
      {
        onError: (error) => {
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