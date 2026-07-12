import { create } from 'zustand';

import { clearToken } from '@duing/api';

import type { User } from '@duing/types';

type AuthState = {
  user: User | null;
  status: 'idle' | 'authenticated' | 'unauthenticated';
  setSession(user: User): void;
  clearSession(): Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'idle',
  setSession(user) {
    set({ user, status: 'authenticated' });
  },
  async clearSession() {
    await clearToken();
    set({ user: null, status: 'unauthenticated' });
  },
}));
