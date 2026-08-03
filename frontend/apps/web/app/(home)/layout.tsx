import type { ReactNode } from 'react';

import { cookies } from 'next/headers';

import { verifyAuthHint } from '@/middleware';

import { AuthHintSeed } from '../_components/AuthHintSeed';
import { HomeNav } from '../_components/HomeNav';

// 홈 상단 GNB 를 페이지가 아닌 레이아웃에 둔다 — 홈은 force-dynamic 이라 탭 재방문 시
// RSC 페치가 도는데, 헤더가 페이지 안에 있으면 로딩 폴백 동안 헤더째 사라져 깜빡인다.
// 레이아웃은 로딩 경계 밖이므로 페치 중에도 GNB 가 유지된다(clubs/facilities 레이아웃과 동일 구조).
//
// A′(스펙 §5.2·§7): 여기서 auth_hint 를 서버 검증해 헤더의 초기 인증 상태를 SSR 에 확정한다.
// 홈은 이미 force-dynamic 이라 cookies() 를 읽어도 정적 페이지 손실이 없다(metric 6).
// 클라이언트로는 boolean 만 내린다 — role 은 담지 않는다(§9.3). 시크릿 부재(로컬 미설정)면
// 검증 불가 → false 로 두고 클라 시드에 맡긴다. 프로덕션 부재는 미들웨어가 이미 부팅을 막는다.
export default async function HomeLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const authHint = cookieStore.get('auth_hint')?.value ?? null;
  const authHintSecret = process.env.AUTH_HINT_SECRET;
  const authHintClaims =
    authHint && authHintSecret ? await verifyAuthHint(authHint, authHintSecret) : null;
  const initialAuthenticated = authHintClaims !== null;
  return (
    <div className="duing min-h-dvh bg-cream">
      <AuthHintSeed authenticated={initialAuthenticated} />
      <HomeNav slimOnMobile initialAuthenticated={initialAuthenticated} />
      {children}
    </div>
  );
}
