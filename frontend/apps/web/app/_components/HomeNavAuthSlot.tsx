'use client';

import Link from 'next/link';

import { useAuthStore } from '@duing/stores';

import { UserMenu } from '@/components/UserMenu';

export function HomeNavAuthSlot() {
  const status = useAuthStore((state) => state.status);

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

  return <UserMenu />;
}
