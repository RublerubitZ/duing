import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { User } from '@duing/types';

// 서버에는 me 조회가 없어 늘 비어 있다. 브라우저는 부팅 세션 복원이 본문 하이드레이션보다 먼저 끝나면
// 캐시에 me 가 이미 있다 — 그 순간을 이 값으로 흉내 낸다.
const meState: { current: User | undefined } = vi.hoisted(() => ({ current: undefined }));

vi.mock('@duing/hooks', () => ({
  useMeQuery: () => ({ data: meState.current, isLoading: false }),
  useManagedClubsQuery: () => ({ data: [] }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { useOperatorAccess } from '@/app/calendar/_lib/useOperatorAccess';

// RTL 을 거치지 않고 hydrateRoot 를 직접 쓰므로 act 환경 플래그를 직접 켠다(없으면 act 경고가 stderr 로 샌다).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const admin: User = {
  id: 9,
  name: '총동연',
  studentId: '20240009',
  phone: '010-0000-0009',
  grade: 'SENIOR',
  role: 'ADMIN',
};

// 캘린더의 "내 일정 추가" 버튼·통계 라벨처럼 SSR 되는 자리에서 권한을 그리는 소비처.
function OperatorProbe() {
  const access = useOperatorAccess();
  return <p>{access.canOperate ? '일정 추가 가능' : '일정 추가 불가'}{access.isAdmin ? ' · 총동연' : ''}</p>;
}

describe('캘린더 일정 추가 권한 — 부팅 세션 복원이 본문 하이드레이션보다 먼저 끝나도 불일치가 없다', () => {
  it('서버처럼 권한 없음으로 하이드레이션하고, 그 뒤 총동연 권한을 붙인다', async () => {
    meState.current = undefined;
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);
    let serverHtml: string;
    try {
      serverHtml = renderToString(<OperatorProbe />);
    } finally {
      vi.unstubAllGlobals();
    }
    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    meState.current = admin;
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recoverableErrors: unknown[] = [];

    const root = await act(async () =>
      hydrateRoot(container, <OperatorProbe />, { onRecoverableError: (error) => recoverableErrors.push(error) }),
    );
    const hydratedText = container.textContent;
    const hydrationWarnings = consoleErrorSpy.mock.calls.filter((args) => /hydrat/i.test(args.map(String).join(' ')));
    act(() => root.unmount());
    consoleErrorSpy.mockRestore();
    container.remove();
    meState.current = undefined;

    expect(serverHtml).toBe('<p>일정 추가 불가</p>');
    expect(recoverableErrors).toEqual([]);
    expect(hydrationWarnings).toEqual([]);
    expect(hydratedText).toBe('일정 추가 가능 · 총동연');
  });
});
