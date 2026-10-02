import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ClubDetailAbout } from '@/app/clubs/[clubId]/_components/ClubDetailAbout';

// RTL 을 거치지 않고 hydrateRoot 를 직접 쓰므로 act 환경 플래그를 직접 켠다(없으면 act 경고가 stderr 로 샌다).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ClubDetailAbout — 하이드레이션', () => {
  it('서버 텍스트로 하이드레이션한 뒤 정화된 HTML 로 바뀌며 불일치가 없다', async () => {
    const element = <ClubDetailAbout description="<p>함께 <strong>운동</strong>해요</p>" highlights={[]} />;
    const container = document.createElement('div');
    container.innerHTML = renderToString(element);
    expect(container.querySelector('strong')).toBeNull();

    const recoverableErrors: unknown[] = [];
    await act(async () => {
      hydrateRoot(container, element, { onRecoverableError: (error) => recoverableErrors.push(error) });
    });

    expect(recoverableErrors).toEqual([]);
    expect(container.querySelector('strong')?.textContent).toBe('운동');
  });
});
