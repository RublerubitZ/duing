'use client';

// 세션 종료 판정의 단일 출처. 갱신(refresh)이 401/404 로 답해 복구가 불가능해졌을 때만
// API 클라이언트가 registerUnauthorizedHandler 로 등록한 이 콜백을 호출한다 —
// 개별 요청의 401 은 "이 요청이 401 이었다"는 뜻일 뿐이라 종료 판정에 쓰지 않는다.
// 상태 정리는 어느 시점의 통지든 수행하고, 안내·이동·서버 정리는 세션이 살아 있던 경우에만 한다.

import { useEffect } from 'react';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useQueryClient } from '@tanstack/react-query';

import { registerUnauthorizedHandler } from '@duing/api';
import { useApiClient } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

import { skipNextOverlayReclaim } from '@/app/_lib/backDismiss';
import { toLinkRoute, toRoute } from '@/app/_lib/route';
import { useToast } from './toast/ToastProvider';

export function SessionExpiryHandler() {
  const router = useGuardedRouter();
  const queryClient = useQueryClient();
  const client = useApiClient();
  const { addToast } = useToast();

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      const { status, isVerified, clearSession } = useAuthStore.getState();
      // 이미 종료가 확정(검증된 미인증)됐으면 중복 통지다. 동시다발 401 의 중복 토스트/이동을
      // 막기 위해 상태를 동기적으로 먼저 내려, 이후 호출은 이 가드에서 걸러지게 한다.
      // 미검증 미인증(시드 전 초기 상태)은 확정이 아니라 "아직 모른다" 라 여기서 걸리지 않는다.
      if (status === 'unauthenticated' && isVerified) return;
      // "이 브라우저에서 세션이 살아 있었는가" — 안내·이동·서버 정리의 게이트다(§9.1).
      // 이제 신뢰할 수 있는 신호(서버로 확인된 세션인가)로만 판정한다. 시드된 authenticated 는
      // 로컬 이력·서버 힌트의 추정일 뿐이라, 여기서 부수효과를 열면 스텔·위조 신호 하나가
      // 로그인한 적 없는 방문자를 로그인 페이지로 튕겨낸다. 익명 방문자는 페이지 로드마다
      // 이 통지를 만든다(익명 방문 → /users/me 401 → 쿠키 없는 refresh 401).
      const hadLiveSession = isVerified && status === 'authenticated';
      // 종료 확정은 동기 setState 로 먼저 기록한다 — clearSession() 은 async 라 이 통지를
      // 유발한 요청의 catch 보다 늦게 반영될 수 있고, 그러면 호출자가 확정된 만료를
      // 일시 장애로 오판한다. 둘을 합치는 정리가 들어오면 이 계약이 조용히 깨진다.
      // isVerified 를 함께 올리는 것도 계약이다 — 빼면 뒤늦은 시드가 확정된 종료를 덮는다.
      useAuthStore.setState({ status: 'unauthenticated', isVerified: true });
      // 이 auth 플립이 열린 오버레이(알림 시트 등)를 언마운트시키므로, 이동 여부와 무관하게 그 닫힘의 회수 back()
      // 을 건너뛴다(#860·#1139). 이동은 뒤따르는 push(살아 있던 세션) 또는 회원 가드의 replace(콜드 로드)가 맡고,
      // 커밋 전 창은 guarded router 의 이동 예약이 닫는다. 열린 오버레이가 없으면 함수 자체가 no-op 이라
      // 익명 방문자의 페이지 로드마다 불러도 비용이 없다.
      skipNextOverlayReclaim();
      // catch 필수 — 이 정리는 익명 방문자의 페이지 로드에서도 돈다. clearSession() 은
      // 저장소 접근(clearToken)을 await 하는데 그 경로엔 가드가 없어(token.ts:18),
      // 사파리 프라이빗처럼 저장소를 못 쓰는 환경이면 공개 트래픽마다 unhandled rejection 이 된다.
      void clearSession().catch(() => {});
      if (!hadLiveSession) return;
      // JS 로 지울 수 없는 HttpOnly 쿠키 3종(auth_hint 포함)을 서버가 정리하게 한다 —
      // 세션이 죽은 뒤 살아남은 auth_hint 는 미들웨어의 라우팅 판단을 오염시킨다.
      // best-effort: 실패해도 사용자 흐름(토스트·로그인 이동)을 막지 않고, 만료 상태의 401 도 정상이다.
      void client.auth.logout().catch(() => {});
      // 이전 사용자 데이터가 화면/캐시에 남지 않도록 비운다(공용 단말 정보 노출 방지).
      queryClient.clear();
      addToast('세션이 만료되었어요. 다시 로그인해 주세요.', { variant: 'error' });
      const currentPath = toLinkRoute(window.location.pathname + window.location.search) ?? '/';
      router.push(toRoute(`/login?next=${encodeURIComponent(currentPath)}`));
    });
    return () => registerUnauthorizedHandler(null);
  }, [router, addToast, queryClient, client]);

  return null;
}
