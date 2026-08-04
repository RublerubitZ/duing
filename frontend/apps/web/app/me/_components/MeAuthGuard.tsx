'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { toRoute } from '@/app/_lib/route';
import { useHydrated } from '@/app/_lib/useHydrated';
import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';

// 미들웨어는 auth_hint(라우팅 힌트)만 보고 /me 를 통과시키므로, 힌트가 실제 세션보다 오래
// 살아남으면 미인증 상태로도 여기까지 도달한다. 시드 모델에서 status 는 항상 현재 최선의
// 판단이다 — 로컬 이력이 있으면 authenticated 로 시드돼 보호 화면이 즉시 열리고, 시드가
// 틀렸다면 만료 핸들러의 확정이 이 가드를 로그인 유도로 되돌린다. 의도적 로그아웃의 일시
// 노출은 기존처럼 delayed-show 가 가린다.
// /me 는 A′(SSR 시드) 라우트가 아니라 SSR/프리렌더 프레임이 스토어 초기값(unauthenticated)으로
// 그려진다 — 그 프레임까지 로그인 유도로 가리면 로그인한 사용자가 하드 로드마다 유도 화면을
// 스친다(delayed-show 는 0.15s 만 가린다). 미하이드레이션 프레임은 판정을 미루고 children 을 그린다.
export function MeAuthGuard({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const status = useSeededAuthStatus();
  const pathname = usePathname();

  if (!hydrated || status !== 'unauthenticated') return <>{children}</>;

  // 의도적 로그아웃·탈퇴·비밀번호 변경도 clearSession 으로 이 분기를 스치고 지나간다(이동
  // 커밋 전까지 잠깐). delayed-show 로 빠른 이동에서는 아예 보이지 않게 하고, 문구도 세션
  // 만료로 단정하지 않는 중립 표현을 쓴다 — 만료 안내 토스트는 SessionExpiryHandler 소관.
  return (
    <div className="delayed-show flex min-h-dvh flex-col items-center justify-center gap-4">
      <p className="text-slate-600">로그인이 필요한 페이지예요. 다시 로그인해 주세요.</p>
      <Link
        href={toRoute(`/login?next=${encodeURIComponent(pathname)}`)}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:border-slate-500"
      >
        로그인하기
      </Link>
    </div>
  );
}
