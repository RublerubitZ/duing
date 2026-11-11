import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import type { User } from '@duing/types';

// 등록만 가로채고 나머지는 실제 모듈을 쓴다(선례 test/lib/public-content.test.ts) — vi.mock 은 파일 단위로 끌어올려져 파일을 따로 둔다.
const { registerConnectivityAdapterMock } = vi.hoisted(() => ({
  registerConnectivityAdapterMock: vi.fn(),
}));

vi.mock('@duing/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@duing/api')>();
  return { ...actual, registerConnectivityAdapter: registerConnectivityAdapterMock };
});

const API_BASE_URL = 'http://localhost:8080/api/v1';
const MEMBER: User = {
  id: 1,
  studentId: '20240001',
  name: '홍길동',
  phone: '010-1234-5678',
  grade: 'FRESHMAN',
  role: 'STUDENT',
};
// providers 를 불러오면 부팅 선점 GET users/me 가 실제로 나간다 — 로컬 백엔드에 닿지 않게 여기서 받는다.
const server = setupServer(
  http.get(`${API_BASE_URL}/users/me`, () => HttpResponse.json({ ok: true, data: MEMBER, message: null })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

it('providers 는 모듈을 불러올 때 웹 연결 어댑터(webConnectivityAdapter)를 등록한다', async () => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', API_BASE_URL);

  await import('@/app/providers');
  // providers 는 환경변수를 넣은 뒤에 평가돼야 해 동적으로 불러온다 — 비교할 어댑터도 같은 레지스트리에서 꺼낸다.
  const { consumeBootSessionRestore, webConnectivityAdapter } = await import('@/app/_lib/authBoot');
  // 선점 요청을 끝까지 받는다 — 먼저 끝나 msw 를 닫으면 요청이 실제 네트워크로 샌다.
  await consumeBootSessionRestore();

  expect(registerConnectivityAdapterMock.mock.calls).toEqual([[webConnectivityAdapter]]);
});
