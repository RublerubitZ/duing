'use client';

import Link from 'next/link';

import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';
import { UserMenu } from '@/components/UserMenu';

// 시드 모델(스펙 §8·§9.2)에서는 "확인 중" 대기 상태가 없다 — status 는 언제나 현재 최선의
// 판단이고, 홈에서는 A′ 서버 시드가 SSR 시점에 이 값을 확정한다(자리표시 제거 — metric 1·2).
// 시드가 틀린 드문 경우(스텔 힌트 등)는 서버 확인이 도착하는 대로 그쪽으로 정정된다.
export function HomeNavAuthSlot({
  initialAuthenticated = null,
}: {
  initialAuthenticated?: boolean | null;
}) {
  const status = useSeededAuthStatus(initialAuthenticated);

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

  return <UserMenu initialAuthenticated={initialAuthenticated} />;
}
