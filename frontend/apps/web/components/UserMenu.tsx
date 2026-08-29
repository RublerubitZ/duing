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
  // 이름은 /users/me 응답(useMeQuery) 그대로다 — 시안(210:2824 login 변형)의 "두두잉님" 자리.
  const userName = meQuery.data?.name ?? '회원';
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
        {/* 시안의 로그인 상태 트리거는 아바타 없는 흰 알약 "이름님" — PC 높이 34·좌우 20·SemiBold 16,
            모바일은 시안 24·66·13 에서 한 단계 키운 26·70·14(로그인/회원가입 알약과 같은 기하).
            테두리 없이 크림 헤더 위 흰 면으로만 분리된다. */}
        <button
          type="button"
          className="flex h-[26px] min-w-[70px] items-center justify-center rounded-full bg-paper px-3 text-[14px] font-semibold tracking-tightest text-ink-deep transition hover:bg-graysoft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:h-[34px] md:px-5 md:text-[16px]"
        >
          {userName}님
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
