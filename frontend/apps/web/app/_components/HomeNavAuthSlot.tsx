'use client';

import Link from 'next/link';

import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';
import { UserMenu } from '@/components/UserMenu';

// 시드 모델(스펙 §8·§9.2)에서는 "확인 중" 대기 상태가 없다 — status 는 언제나 현재 최선의
// 판단이다. initialAuthenticated 는 A′ 서버 시드용 통로였으나 홈 ISR 전환(#925)으로 현재 웹
// 라우트는 전부 null(클라 시드) 경로만 쓴다 — 시드가 틀린 드문 경우는 서버 확인이 정정한다.
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
