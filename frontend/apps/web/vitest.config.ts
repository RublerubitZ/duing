import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      // 모노레포 내 pnpm 이 react 를 두 군데(apps/web, root)에 설치해 react-dom 과
      // 페이지 컴포넌트가 서로 다른 React 인스턴스를 쓰면 "Invalid hook call" 이 발생한다.
      // react-dom 이 사용하는 루트 react 인스턴스 하나로 수렴시킨다.
      react: path.resolve(__dirname, '../../node_modules/.pnpm/react@19.2.6/node_modules/react'),
      'react-dom': path.resolve(__dirname, '../../node_modules/.pnpm/react-dom@19.2.6_react@19.2.6/node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, '../../node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': path.resolve(__dirname, '../../node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-dev-runtime'),
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
