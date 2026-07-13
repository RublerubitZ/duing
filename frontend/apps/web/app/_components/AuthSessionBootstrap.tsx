'use client';

import { useEffect, useState } from 'react';

import { ApiError } from '@duing/api';
import { useApiClient } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

export function AuthSessionBootstrap() {
  const [hasRecoveryError, setHasRecoveryError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const client = useApiClient();
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    let cancelled = false;
    setHasRecoveryError(false);
    void client.users
      .me()
      .then((user) => {
        if (!cancelled) setSession(user);
      })
      .catch((sessionError: unknown) => {
        if (
          !cancelled &&
          sessionError instanceof ApiError &&
          sessionError.status === 401
        ) {
          void clearSession();
          return;
        }
        if (!cancelled) setHasRecoveryError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, client, setSession, clearSession]);

  if (!hasRecoveryError) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg"
    >
      <span>세션을 확인하지 못했습니다. 로그인 상태는 유지됩니다.</span>
      <button
        type="button"
        className="shrink-0 rounded-md border border-amber-500 px-3 py-1 font-semibold hover:bg-amber-100"
        onClick={() => setAttempt((currentAttempt) => currentAttempt + 1)}
      >
        다시 시도
      </button>
    </div>
  );
}
