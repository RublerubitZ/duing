import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { NoticeContent } from '@/app/notices/_components/NoticeContent';

// RTL 을 거치지 않고 hydrateRoot 를 직접 쓰므로 act 환경 플래그를 직접 켠다(없으면 act 경고가 stderr 로 샌다).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('NoticeContent — 하이드레이션', () => {
  it('서버·첫 프레임은 평문 문단, 하이드레이션 뒤 정화된 HTML 로 바뀌고 불일치가 없다', async () => {
    const element = <NoticeContent content="<p>첫 <strong>문단</strong></p><p>둘째 문단</p>" format="HTML" />;
    const container = document.createElement('div');
    container.innerHTML = renderToString(element);

    expect(container.querySelector('strong')).toBeNull();
    expect(container.textContent).toContain('첫 문단');

    const recoverableErrors: unknown[] = [];
    await act(async () => {
      hydrateRoot(container, element, { onRecoverableError: (error) => recoverableErrors.push(error) });
    });

    expect(recoverableErrors).toEqual([]);
    expect(container.querySelector('strong')?.textContent).toBe('문단');
  });
});
