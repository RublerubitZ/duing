import { act, type ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { NoticeArticleHeader } from '@/app/notices/_components/NoticeArticleHeader';
import { NoticeMetaCard } from '@/app/notices/_components/NoticeMetaCard';

import { kstWallClock } from './kst-wall-clock';

// RTL 을 거치지 않고 hydrateRoot 를 직접 쓰므로 act 환경 플래그를 직접 켠다(없으면 act 경고가 stderr 로 샌다).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function renderServerThenHydrate(element: ReactElement) {
  const container = document.createElement('div');
  container.innerHTML = renderToString(element);
  const serverText = container.textContent ?? '';
  const recoverableErrors: unknown[] = [];
  await act(async () => {
    hydrateRoot(container, element, { onRecoverableError: (error) => recoverableErrors.push(error) });
  });
  return { serverText, hydratedText: container.textContent ?? '', recoverableErrors };
}

function header(expiresAt: string) {
  return (
    <NoticeArticleHeader
      category="GENERAL"
      title="공지 제목"
      pinned={false}
      expiresAt={expiresAt}
      createdAt="2026-09-01T00:00:00Z"
    />
  );
}

// 공개 소식 상세는 24시간 ISR 이라 HTML 이 하루 넘게 묵을 수 있다 — 렌더 시각의 D-day·만료 여부를 서버 HTML 에
// 박으면 보는 시각의 하이드레이션과 글자가 달라진다(#418). 서버·첫 프레임에는 그리지 않고 하이드레이션 뒤에 붙인다.
describe('소식 마감 표시 — 하이드레이션 뒤에만 계산', () => {
  it('머리말 D-day 배지는 서버 HTML 에 없고 하이드레이션 뒤 불일치 없이 붙는다', async () => {
    const { serverText, hydratedText, recoverableErrors } = await renderServerThenHydrate(
      header(kstWallClock(3 * 86_400_000)),
    );

    expect(serverText).not.toContain('D-3');
    expect(recoverableErrors).toEqual([]);
    expect(hydratedText).toContain('D-3');
  });

  it('지난 마감도 서버 HTML 에는 "마감" 배지가 없고 하이드레이션 뒤에 붙는다', async () => {
    const { serverText, hydratedText, recoverableErrors } = await renderServerThenHydrate(
      header(kstWallClock(-2 * 3_600_000)),
    );

    expect(serverText).not.toContain('마감');
    expect(recoverableErrors).toEqual([]);
    expect(hydratedText).toContain('마감');
  });

  it('공지 정보 카드의 마감 행은 서버에 날짜만, 하이드레이션 뒤 D-day 를 붙인다', async () => {
    const { serverText, hydratedText, recoverableErrors } = await renderServerThenHydrate(
      <NoticeMetaCard
        category="GENERAL"
        createdAt="2026-09-01T00:00:00Z"
        expiresAt={kstWallClock(3 * 86_400_000)}
        tags={[]}
        linkUrl={null}
      />,
    );

    expect(serverText).toContain('마감');
    expect(serverText).not.toContain('D-3');
    expect(recoverableErrors).toEqual([]);
    expect(hydratedText).toContain('D-3');
  });
});
