'use client';

import Link from 'next/link';

import { useAuthStore } from '@duing/stores';

import { UserMenu } from '@/components/UserMenu';

export function HomeNavAuthSlot() {
  const status = useAuthStore((state) => state.status);

  // 세션 확인 중(idle)에는 로그인 여부를 단정하지 않는다 — 이미 로그인한 사용자에게 로그인 버튼을
  // 먼저 보여주면 "로그아웃됐다"로 읽힌다(MeAuthGuard 와 같은 규약). 자리는 비우지 않고 실제 버튼과
  // 같은 클래스의 자리표시로 채워, 확정 시 헤더가 흔들리지 않게 한다(크기를 상수로 재지 않는 이유).
  if (status === 'idle') {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="로그인 상태 확인 중"
        className="flex animate-pulse items-center gap-2.5 motion-reduce:animate-none"
      >
        {/* 실제 라벨을 그대로 두되 aria-hidden 으로 감춘다 — 크기는 글자에서 나오고,
            읽히는 문구는 컨테이너의 "로그인 상태 확인 중" 하나로 유지한다. */}
        <span
          aria-hidden="true"
          className="grid h-10 place-items-center rounded-full bg-graysoft px-4 text-[13px] font-semibold text-transparent"
        >
          로그인
        </span>
        <span aria-hidden="true" className="btn btn-sm rounded-full bg-graysoft px-4 text-transparent">
          가입하기
        </span>
      </div>
    );
  }

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
