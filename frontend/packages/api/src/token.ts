import { getStorage } from '@duing/storage';

export const TOKEN_STORAGE_KEY = 'duing.accessToken';

export async function readToken(): Promise<string | null> {
  try {
    return await getStorage().getItem(TOKEN_STORAGE_KEY);
  } catch {
    // 서버 사이드 렌더링 환경에서는 storage 가 주입되지 않으므로 null 반환
    return null;
  }
}

export async function writeToken(token: string): Promise<void> {
  await getStorage().setItem(TOKEN_STORAGE_KEY, token);
}

export async function clearToken(): Promise<void> {
  await getStorage().removeItem(TOKEN_STORAGE_KEY);
}
