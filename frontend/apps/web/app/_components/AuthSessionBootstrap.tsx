'use client';

import { useEffect, useRef, useState } from 'react';

import { useApiClient } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

import { useToast } from '@/app/_components/toast/ToastProvider';
import posthog from 'posthog-js';

// 이 브라우저에서 세션이 살아 있던 적이 있는지 표시하는 로컬 플래그.
// 인증 쿠키 3종은 모두 HttpOnly 라 JS 로는 로그인 여부를 알 수 없는데, 로그인한 적도 없는
// 방문자에게 "세션을 확인하지 못했습니다" 를 띄우면 뜻이 통하지 않는다. 알림 노출 여부만
// 이 플래그로 가른다 — 요청 자체는 항상 보낸다(플래그가 지워져도 세션 복원은 그대로 동작).
//
// 갱신은 아래 status 구독 한 곳에서만 한다. 세션이 서고 지워지는 경로가 여럿이라
// (로그인 뮤테이션·로그아웃·전체 로그아웃·만료 처리·이 컴포넌트의 복원) 호출부마다 플래그를
// 심으면 반드시 빠지는 곳이 생기고, 그 구멍은 "방금 로그인한 사용자가 새로고침 중 일시 오류를
// 만나면 알림도 재시도 버튼도 못 받는" 침묵으로 나타난다. 모든 경로가 스토어 status 를 지나므로
// 여기서 한 번만 따라가면 된다. 저장소는 웹 전용이라 packages/* 가 아닌 이 앱 계층에 둔다.
const HAD_SESSION_KEY = 'duing:had-session';

function markHadSession(value: boolean): void {
  try {
    if (value) window.localStorage.setItem(HAD_SESSION_KEY, '1');
    else window.localStorage.removeItem(HAD_SESSION_KEY);
  } catch {
    // 저장소를 못 쓰는 환경(사파리 프라이빗 등) — 알림이 생략될 뿐 세션 복원에는 영향 없다.
  }
}

function hadSession(): boolean {
  try {
    return window.localStorage.getItem(HAD_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function AuthSessionBootstrap() {
  const [attempt, setAttempt] = useState(0);
  const client = useApiClient();
  const setSession = useAuthStore((state) => state.setSession);
  const status = useAuthStore((state) => state.status);
  const { addToast } = useToast();

  const previousStatusRef = useRef(status);

  useEffect(() => {
    if (status === 'authenticated') markHadSession(true);
    else if (status === 'unauthenticated') {
      markHadSession(false);
      // 로그아웃·만료·전체 로그아웃·탈퇴 등 모든 세션 종료가 이 전이를 지난다 — 공용 단말에서
      // 다음 사용자의 이벤트가 이전 distinct_id 에 붙지 않도록 여기서 한 번만 초기화한다.
      // 익명 방문자의 401(idle→unauthenticated)은 제외 — 익명 id 까지 매 방문 갈아치우면
      // 가입 전 행동과 가입 후 identify 의 연결이 끊긴다.
      if (previousStatusRef.current === 'authenticated') posthog.reset();
    }
    previousStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    void client.users
      .me()
      .then((user) => {
        if (cancelled) return;
        setSession(user);
        posthog.identify(String(user.id), { role: user.role, grade: user.grade, college: user.college });
      })
      .catch(() => {
        if (cancelled) return;
        // 401 을 세션 종료로 해석하지 않는다. 진짜 만료와 일시 장애(갱신이 403·5xx·타임아웃·
        // 오프라인으로 실패)의 예외 객체가 완전히 동일해, 반환 채널만으로는 구분할 근거가 없다.
        // 종료 판정은 SessionExpiryHandler 한 곳에 있고, 확정됐다면 그쪽이 이 catch 보다 먼저
        // (동기 setState 로) 스토어를 내려둔다 — 여기서는 그 결과만 읽는다.
        // TODO(후속): 다른 탭이 10초 내 갱신해 'skipped' 로 재시도된 요청이 다시 401 이면
        // 사이드 채널이 울리지 않아, 서버측 세션 폐기가 일시 장애로 오분류된다.
        // 스킵 캐시를 무시하고 갱신을 한 번 강제하는 packages/api 변경이 필요하다.
        if (useAuthStore.getState().status === 'unauthenticated') return;
        if (!hadSession()) return;
        // durationMs 0 — 자동으로 사라지지 않는다. 복구 수단(다시 시도)이 붙은 알림이라
        // 사용자가 처리하거나 닫을 때까지 남는다.
        addToast('세션을 확인하지 못했습니다. 로그인 상태는 유지됩니다.', {
          variant: 'error',
          durationMs: 0,
          action: {
            label: '다시 시도',
            onClick: () => setAttempt((currentAttempt) => currentAttempt + 1),
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, client, setSession, addToast]);

  return null;
}
