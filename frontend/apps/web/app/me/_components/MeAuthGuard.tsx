'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { toRoute } from '@/app/_lib/route';
import { useBoundedAuthStatus } from '@/app/_lib/useBoundedAuthStatus';

// 미들웨어는 auth_hint(라우팅 힌트)만 보고 /me 를 통과시키므로, 힌트가 실제 세션보다
// 오래 살아남으면 미인증 상태로도 여기까지 도달한다. 만료가 확정된(unauthenticated)
// 경우에만 로그인 유도를 렌더한다 — idle(부트스트랩 진행 중)까지 가리면 매 하드 로드마다
// 로그인 화면이 플래시되므로 idle 은 기존 흐름 그대로 children 을 렌더한다.
// 상한을 둔 status 를 쓴다 — 갱신이 만료 외의 사유로 실패하면 확인이 끝나지 않아 idle 이
// 영구히 남는데, 그때 이 가드가 보호 화면을 계속 렌더하면 모든 요청이 401 인 껍데기에 갇힌다.
export function MeAuthGuard({ children }: { children: ReactNode }) {
  const status = useBoundedAuthStatus();
  const pathname = usePathname();

  if (status !== 'unauthenticated') return <>{children}</>;

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
