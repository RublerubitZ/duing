import { create } from 'zustand';
import type { User } from '@duing/types';
import {
  clearToken,
  readToken,
  writeToken,
  setAuthToken,
  clearAuthToken,
} from '@duing/api';

type AuthState = {
  user: User | null;
  accessToken: string | null;
  status: 'idle' | 'authenticated' | 'unauthenticated';
  setSession(user: User, accessToken: string): Promise<void>;
  clearSession(): Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: 'idle',
  async setSession(user, accessToken) {
    await writeToken(accessToken);
    setAuthToken(accessToken); // 쿠키 (미들웨어용)
    set({ user, accessToken, status: 'authenticated' });
  },
  async clearSession() {
    await clearToken();
    clearAuthToken();
    set({ user: null, accessToken: null, status: 'unauthenticated' });
  },
}));

// 앱 진입 시 1회 호출: localStorage / AsyncStorage 에서 토큰을 읽어 store 에 반영.
// 사용자 정보까지 복원하려면 별도로 client.users.me() 호출이 필요하다.
export async function hydrateAuthFromStorage(): Promise<void> {
  const token = await readToken();
  if (token) {
    setAuthToken(token);
    useAuthStore.setState({ accessToken: token, status: 'authenticated' });
  } else {
    useAuthStore.setState({ status: 'unauthenticated' });
  }
}
