import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ClubExploreFallback } from '@/app/clubs/_components/ClubExploreFallback';
import { SCOPE_SEGMENT_CLASS } from '@/app/clubs/_lib/exploreUi';

import { clubListPage } from './club-explore-fallback-fixture';

// 조상 관계(깜빡임 래퍼 아래인지)는 서버 문자열로 볼 수 없어 jsdom 에서 단언한다.
describe('ClubExploreFallback — 구조', () => {
  it('카드·제목·컨트롤 행은 깜빡이지 않는다 — 깜빡이는 것은 빈 회색 자리(검색 2·사이드바 1)뿐', () => {
    const { container } = render(<ClubExploreFallback page={clubListPage} />);

    for (const link of screen.getAllByRole('link', { name: /모션케어/ })) {
      expect(link.closest('.animate-pulse')).toBeNull();
    }
    const pulsing = container.querySelectorAll('.animate-pulse');
    expect(pulsing).toHaveLength(3);
    for (const placeholder of pulsing) expect(placeholder).toBeEmptyDOMElement();
  });

  it('카드 위 행을 실제 페이지 문구로 그린다 — 제목·스코프 세그먼트·카운트/정렬 행·필터 버튼·카테고리 레일', () => {
    render(<ClubExploreFallback page={clubListPage} />);

    expect(screen.getAllByRole('heading', { level: 1 }).map((heading) => heading.textContent)).toEqual([
      '166개 동아리를 둘러보세요',
      '동아리 탐색',
    ]);
    // 데스크탑 스코프 세그먼트 — 3개(전체·중앙·단과대 순), '전체' 만 선택(선택 클래스 + 힌트).
    const scopeButtons = within(screen.getByRole('button', { name: '중앙동아리' }).parentElement!).getAllByRole('button');
    expect(scopeButtons.map((button) => button.textContent)).toEqual(['전체· 모든 동아리', '중앙동아리', '단과대 동아리']);
    expect(scopeButtons.map((button) => button.className)).toEqual([
      SCOPE_SEGMENT_CLASS(true),
      SCOPE_SEGMENT_CLASS(false),
      SCOPE_SEGMENT_CLASS(false),
    ]);
    expect(screen.getByText('2개')).toBeInTheDocument();
    expect(screen.getByText('· 현재 페이지 (전체 166개)')).toBeInTheDocument();
    // 찜 칩은 실제처럼 토글 버튼(aria-pressed) — 꺼진 상태.
    expect(screen.getByRole('button', { name: '찜한 동아리' })).toHaveAttribute('aria-pressed', 'false');
    // 정렬은 데스크탑·모바일 모두 실제와 같은 select(비제어) — 추천순 선택, 옵션도 같다.
    const sortSelects = screen.getAllByRole('combobox');
    expect(sortSelects).toHaveLength(2);
    for (const sortSelect of sortSelects) {
      expect(sortSelect).toHaveValue('RECOMMENDED');
      expect(within(sortSelect).getAllByRole('option').map((option) => option.textContent)).toEqual([
        '추천순',
        '마감 임박순',
        '가나다순',
      ]);
    }
    expect(screen.getByRole('button', { name: '필터' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation')).getAllByRole('button').map((tab) => tab.textContent),
    ).toEqual(['전체', '학술', '창작', '예술', '운동', '봉사', '종교', '취미', '기타']);
  });
});
