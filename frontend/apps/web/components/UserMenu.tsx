'use client';

import Link from 'next/link';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';

import { useAuthStore } from '@duing/stores';
import { useLogout, useMeQuery } from '@duing/hooks';

import { toRoute } from '@/app/_lib/route';
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

export function UserMenu() {
  const status = useAuthStore((state) => state.status);
  const meQuery = useMeQuery();
  const logout = useLogout();
  const router = useGuardedRouter();

  if (status !== 'authenticated') return null;

  const userName = meQuery.data?.name ?? '회원';
  const initial = userName.slice(-2).charAt(0);
  const isAdmin = meQuery.data?.role === 'ADMIN';

  const handleLogout = async () => {
    await logout();
    router.refresh();
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
