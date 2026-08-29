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
      // 시안의 상단바 CTA — 로그인은 면 없는 잉크 텍스트, 회원가입은 딥그린 알약에 라이트그린 글자다.
      // 회원가입은 .btn 의 기하·전환만 가져오고 색은 직접 준다 — btn-primary(ink/paper)와 색 조합이 다르다.
      <div className="flex items-center gap-2 lg:gap-3">
        <Link
          href="/login"
          className="grid h-10 place-items-center rounded-full px-4 text-[14px] font-semibold tracking-tightest text-ink-deep hover:bg-graysoft lg:px-6 lg:text-[16px]"
        >
          로그인
        </Link>
        <Link
          href="/signup"
          className="btn h-10 rounded-full bg-ink-deep px-4 py-0 text-[14px] tracking-tightest text-sage-mist hover:bg-ink lg:px-6 lg:text-[16px]"
        >
          회원가입
        </Link>
      </div>
    );
  }

  return <UserMenu initialAuthenticated={initialAuthenticated} />;
}
