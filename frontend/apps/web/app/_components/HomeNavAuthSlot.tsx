'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@duing/stores';
import { useLogout, useMeQuery } from '@duing/hooks';

export function HomeNavAuthSlot() {
  const status = useAuthStore((state) => state.status);
  const meQuery = useMeQuery();
  const logout = useLogout();
  const router = useRouter();

  if (status !== 'authenticated') {
    return (
      <div className="flex items-center gap-2.5">
        <Link
          href="/login"
          className="grid h-10 place-items-center rounded-full px-4 text-[13px] font-semibold text-charcoal-2 hover:bg-graysoft"
        >
          로그인
        </Link>
        <Link href="/signup" className="btn btn-primary btn-sm rounded-full px-4">
          가입하기
        </Link>
      </div>
    );
  }

  const userName = meQuery.data?.name ?? '회원';
  const initial = userName.slice(-2);

  async function handleLogout() {
    await logout();
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/me"
        className="flex items-center gap-2 rounded-full border border-line bg-paper py-1 pl-3 pr-1.5 text-[13px] font-bold text-ink hover:border-ink"
      >
        {userName}님
        <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
          {initial.charAt(0)}
        </span>
      </Link>
      <button
        type="button"
        onClick={handleLogout}
        className="grid h-10 place-items-center rounded-full px-3 text-[13px] font-semibold text-charcoal-3 hover:bg-graysoft hover:text-charcoal"
      >
        로그아웃
      </button>
    </div>
  );
}
