/**
 * @vitest-environment node
 */
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ClubExploreFallback } from '@/app/clubs/_components/ClubExploreFallback';

import { clubListPage } from './club-explore-fallback-fixture';

// 단언이 실패해도 console.error 가 막힌 채 남지 않게 매 테스트 뒤 되돌린다.
afterEach(() => vi.restoreAllMocks());

// 빌드·재생성 중 서버에서 그려진다 — throw 하면 빌드가 깨지거나 재생성이 실패한다.
describe('ClubExploreFallback — 서버 렌더', () => {
  it('기본 목록 카드(이름·한 줄 소개·상세 링크)와 실제 제목을 경고 없이 담는다', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const html = renderToString(<ClubExploreFallback page={clubListPage} />);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(html).toContain('모션케어');
    expect(html).toContain('함께 운동해요');
    expect(html).toContain('href="/clubs/1"');
    expect(html).toContain('166개 동아리를 둘러보세요');
    expect(html).toContain('동아리 탐색');
    // 첫 화면에서 CSS 로 떠오르는 카드 래퍼와, 실제 화면이 교체 때 다시 재생하지 않도록 보는 표시 속성.
    expect(html).toContain('data-explore-server-list');
    expect(html).toContain('enter-stagger');
    expect(html).toContain('--i:0');
  });

  it('데이터가 없으면 지금 스켈레톤을 그린다', () => {
    const html = renderToString(<ClubExploreFallback page={null} />);

    expect(html).toContain('동아리 목록 불러오는 중');
    expect(html).not.toContain('href="/clubs/');
    expect(html).not.toContain('data-explore-server-list');
  });
});
