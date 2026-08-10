import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  // edge 런타임은 의도적으로 초기화하지 않는다 — 이 프로젝트의 edge 런타임 사용처는 미들웨어뿐이고
  // (`export const runtime = 'edge'` 0건), Sentry.init 은 @sentry/vercel-edge 클라이언트·인테그레이션과
  // @opentelemetry/api·resources 를 미들웨어 아이솔레이트에 올려 부팅마다 평가 비용을 Active CPU 로 물린다.
  //
  // 대가는 분명히 적어둔다: 미들웨어에서 난 예외는 이제 Sentry 로 보고되지 않는다. 실질적인 throw 경로는
  // AUTH_HINT_SECRET 미설정 하나인데(검증 실패는 전부 null 반환), 그러면 보호 경로 4종(/apply·/me·/manage
  // ·/admin)만 500 이고 공개 경로는 200 이라 공개 경로만 보는 모니터로는 안 잡힌다. 그래서 이 판단의
  // 전제로 uptime 모니터 5번(deploy/UPTIME.md — 미인증 `/me` 가 307 인지 확인)을 함께 두었다.
  // 그 모니터를 떼거나 edge 라우트 핸들러를 추가하면 이 판단을 다시 해야 한다.
}

// 서버 컴포넌트·라우트 핸들러에서 발생한 에러를 Sentry 로 캡처한다. nodejs 런타임용이지만 Next 는 이
// 파일을 edge 번들에도 넣으므로, 이 export 때문에 Sentry 코어 ~13KB 가 미들웨어 아이솔레이트에 남는다
// (위에서 init 을 빼 클라이언트가 없으므로 edge 에서 호출돼도 no-op 이다. vercel-edge 클라이언트와
// 인테그레이션, Sentry 쪽 OTel 의존은 트리셰이킹으로 빠졌다 — 미들웨어 번들에 남은 @opentelemetry/api
// 는 Next 자체 tracer 소유라 이 변경과 무관하다).
export const onRequestError = Sentry.captureRequestError;
