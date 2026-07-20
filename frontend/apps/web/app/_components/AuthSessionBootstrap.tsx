'use client';

import { useEffect, useState } from 'react';

import { ApiError } from '@duing/api';
import { useApiClient } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

import { useToast } from '@/app/_components/toast/ToastProvider';

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
  const clearSession = useAuthStore((state) => state.clearSession);
  const status = useAuthStore((state) => state.status);
  const { addToast } = useToast();

  useEffect(() => {
    if (status === 'authenticated') markHadSession(true);
    else if (status === 'unauthenticated') markHadSession(false);
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    void client.users
      .me()
      .then((user) => {
        if (cancelled) return;
        setSession(user);
      })
      .catch((sessionError: unknown) => {
        if (cancelled) return;
        if (sessionError instanceof ApiError && sessionError.status === 401) {
          void clearSession();
          return;
        }
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
  }, [attempt, client, setSession, clearSession, addToast]);

  return null;
}
