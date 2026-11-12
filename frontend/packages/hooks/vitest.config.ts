import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // RTL 의 자동 cleanup·act 환경 등록은 전역 afterEach·beforeAll/afterAll 이 있어야 켜진다 — 없으면 renderHook 트리가 다음 테스트까지 남는다.
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
