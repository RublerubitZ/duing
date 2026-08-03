'use client';

import Link from 'next/link';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';

import { useLogout, useMeQuery } from '@duing/hooks';

import { toRoute } from '@/app/_lib/route';
import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';
import { useToast } from '@/app/_components/toast/ToastProvider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const MENU_ITEMS = [
  { label: '마이페이지', href: '/me' },
  { label: '설정', href: '/me/settings' },
] as const;

export function UserMenu({
  initialAuthenticated = null,
}: {
  initialAuthenticated?: boolean | null;
} = {}) {
  const status = useSeededAuthStatus(initialAuthenticated);
  const meQuery = useMeQuery();
  const logout = useLogout();
  const router = useGuardedRouter();
  const { addToast } = useToast();

  if (status !== 'authenticated') return null;

  // 시드 직후에는 프로필이 아직 없다 — '회원' 폴백이 SSR·시드 구간을 그대로 받는다(기존 폴백 재사용).
  const userName = meQuery.data?.name ?? '회원';
  const initial = userName.slice(-2).charAt(0);
  const isAdmin = meQuery.data?.role === 'ADMIN';

  const handleLogout = async () => {
    try {
      await logout();
      router.refresh();
    } catch {
      addToast(
        '로그아웃하지 못했습니다. 네트워크 연결 후 다시 시도하고 이 기기를 떠나지 마세요.',
        { variant: 'error' },
      );
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-line bg-paper py-1 pl-3 pr-1.5 text-[13px] font-bold text-ink hover:border-ink"
        >
          {userName}님
          <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
            {initial}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[160px] p-0">
        {MENU_ITEMS.map((item) => (
          <DropdownMenuItem
            key={item.label}
            asChild
            className="rounded-none border-b border-line px-4 py-3 text-[13.5px] font-semibold text-ink-deep"
          >
            <Link href={item.href}>{item.label}</Link>
          </DropdownMenuItem>
        ))}
        {isAdmin && (
          <DropdownMenuItem
            asChild
            className="rounded-none border-b border-line px-4 py-3 text-[13.5px] font-semibold text-ink-deep"
          >
            <Link href={toRoute('/admin/clubs')}>총동연 콘솔</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={handleLogout}
          className="rounded-none px-4 py-3 text-[13.5px] font-bold text-coral"
        >
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
