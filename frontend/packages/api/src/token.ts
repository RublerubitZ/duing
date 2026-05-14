import { getStorage } from '@duing/storage';

export const TOKEN_STORAGE_KEY = 'duing.accessToken';

export async function readToken(): Promise<string | null> {
  return getStorage().getItem(TOKEN_STORAGE_KEY);
}

export async function writeToken(token: string): Promise<void> {
  await getStorage().setItem(TOKEN_STORAGE_KEY, token);
}

export async function clearToken(): Promise<void> {
  await getStorage().removeItem(TOKEN_STORAGE_KEY);
}
