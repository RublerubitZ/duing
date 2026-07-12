'use client';

import { useEffect } from 'react';

import { ApiError } from '@duing/api';
import { useApiClient } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

export function AuthSessionBootstrap() {
  const client = useApiClient();
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    let cancelled = false;
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
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, setSession, clearSession]);

  return null;
}
