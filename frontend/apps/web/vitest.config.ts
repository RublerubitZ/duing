import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import path from 'node:path';

// 의존성이 react 를 두 버전으로 끌어오면 react-dom 과 페이지 컴포넌트가 서로 다른
// React 인스턴스를 써 "Invalid hook call" 이 발생한다. react-dom 이 실제로 불러오는 react 하나로
// 수렴시킨다. 경로를 버전 문자열로 적으면 React 를 올릴 때 경로가 사라져 전체 스위트가 import
// 실패로 깨지므로, 설치 위치를 찾아 쓴다. `react/jsx-runtime` 같은 하위 경로도 `react` 별칭이 함께 바꾼다.
const reactDomDir = path.dirname(createRequire(path.join(__dirname, 'package.json')).resolve('react-dom/package.json'));
const reactDir = path.dirname(createRequire(path.join(reactDomDir, 'package.json')).resolve('react/package.json'));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      react: reactDir,
      'react-dom': reactDomDir,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    css: false,
  },
});
