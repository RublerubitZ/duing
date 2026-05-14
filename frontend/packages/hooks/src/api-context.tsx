import { createContext, useContext, type ReactNode } from 'react';
import type { DuingApiClient } from '@duing/api';

const ApiClientContext = createContext<DuingApiClient | null>(null);

export function ApiClientProvider({
  client,
  children,
}: {
  client: DuingApiClient;
  children: ReactNode;
}) {
  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>;
}

export function useApiClient(): DuingApiClient {
  const client = useContext(ApiClientContext);
  if (!client) {
    throw new Error('useApiClient: ApiClientProvider 로 감싸지 않았습니다.');
  }
  return client;
}
