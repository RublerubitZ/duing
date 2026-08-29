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
      // PC(컴포넌트 210:2824, ×0.815): 높이 42→34·좌우 24→20·글자 Medium 20→16·간격 12→10.
      // 모바일(426:4094, 1:1)은 높이 24·폭 66·글자 13 인데 한 단계 키워 26·70·14 로 둔다 — 13 은 타입 스케일 밖이고
      // 14(Body/Small)가 40px 헤더 행에서 더 또렷하다(사용자 요청). 간격 4. 경계는 상단 네비 링크와 같은 md.
      <div className="flex items-center gap-1 md:gap-2.5">
        <Link
          href="/login"
          className="grid h-[26px] w-[70px] place-items-center rounded-full text-[14px] font-medium tracking-tightest text-ink-deep transition hover:bg-graysoft md:h-[34px] md:w-auto md:px-5 md:text-[16px]"
        >
          로그인
        </Link>
        <Link
          href="/signup"
          className="grid h-[26px] w-[70px] place-items-center rounded-full bg-ink-deep text-[14px] font-medium tracking-tightest text-sage-mist transition hover:bg-ink md:h-[34px] md:w-auto md:px-5 md:text-[16px]"
        >
          회원가입
        </Link>
      </div>
    );
  }

  return <UserMenu initialAuthenticated={initialAuthenticated} />;
}
