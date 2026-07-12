'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { NETWORK_ERROR_MESSAGE } from '@duing/api';

import { useOptionalToast } from '@/app/_components/toast/ToastProvider';

type AppRouter = ReturnType<typeof useRouter>;

// 프로그래매틱 내비게이션(push/replace)의 오프라인 방어.
// 오프라인에서 새 라우트 이동은 RSC fetch 실패 → Next 라우터의 하드 내비게이션 폴백으로
// 브라우저 오류 페이지 이탈을 일으킨다(재현 실험으로 확인). 앵커 클릭은 OfflineNavigationGuard 가
// 막지만, 버튼·행·셀렉트의 router 직접 호출은 이 훅이 유일한 방어선이다.
// refresh 도 RSC fetch 실패 시 동일한 MPA 폴백(location.href)을 타므로 push/replace 와 함께
// 차단하되, "이동"이 아닌 데이터 재검증이라 오프라인 안내 토스트 없이 조용히 스킵한다.
// back/forward 는 브라우저 뒤로 버튼과의 동작 일치(파리티)를 위해 통과 — 라우터 캐시 소실 시
// 잔여 MPA 폴백 위험은 수용한다. prefetch 는 이탈 위험이 없어 통과.
// 알려진 한계: 차단은 재시도를 예약하지 않는다 — effect 기반 필수 redirect(접근 가드 등)는
// 오프라인 동안 호출 화면에 잔류한다. 온라인 복구 자동 재시도가 필요해지면 useOnlineStatus 구독 +
// 마지막 차단 이동 재실행을 별도 설계할 것(오래된 redirect 재생 위험 검토 필수).
// 직접 `useRouter` import 는 ESLint(no-restricted-imports)로 금지되어 이 훅이 단일 진입점이 된다.
export function useGuardedRouter(): AppRouter {
  const router = useRouter();
  const addToast = useOptionalToast();

  return useMemo(
    () => ({
      ...router,
      push: (...pushArgs: Parameters<AppRouter['push']>) => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          addToast?.(NETWORK_ERROR_MESSAGE, { variant: 'error' });
          return;
        }
        router.push(...pushArgs);
      },
      replace: (...replaceArgs: Parameters<AppRouter['replace']>) => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          addToast?.(NETWORK_ERROR_MESSAGE, { variant: 'error' });
          return;
        }
        router.replace(...replaceArgs);
      },
      refresh: () => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          return;
        }
        router.refresh();
      },
    }),
    [router, addToast],
  );
}
