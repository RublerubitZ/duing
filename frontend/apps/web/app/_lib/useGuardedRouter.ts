'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useOptionalToast } from '@/app/_components/toast/ToastProvider';

type AppRouter = ReturnType<typeof useRouter>;

// 프로그래매틱 내비게이션(push/replace)의 오프라인 방어.
// 오프라인에서 새 라우트 이동은 RSC fetch 실패 → Next 라우터의 하드 내비게이션 폴백으로
// 브라우저 오류 페이지 이탈을 일으킨다(재현 실험으로 확인). 앵커 클릭은 OfflineNavigationGuard 가
// 막지만, 버튼·행·셀렉트의 router 직접 호출은 이 훅이 유일한 방어선이다.
// back/forward 는 히스토리·라우터 캐시 기반이라 통과시키고, refresh/prefetch 도 이탈 위험이 없어 통과.
// 직접 `useRouter` import 는 ESLint(no-restricted-imports)로 금지되어 이 훅이 단일 진입점이 된다.
export function useGuardedRouter(): AppRouter {
  const router = useRouter();
  const addToast = useOptionalToast();

  return useMemo(
    () => ({
      ...router,
      push: (...pushArgs: Parameters<AppRouter['push']>) => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          addToast?.('인터넷 연결을 확인해주세요.', { variant: 'error' });
          return;
        }
        router.push(...pushArgs);
      },
      replace: (...replaceArgs: Parameters<AppRouter['replace']>) => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          addToast?.('인터넷 연결을 확인해주세요.', { variant: 'error' });
          return;
        }
        router.replace(...replaceArgs);
      },
    }),
    [router, addToast],
  );
}
