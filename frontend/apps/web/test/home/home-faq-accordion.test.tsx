import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FederationFaqItem } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

/* ── 테스트 데이터 ───────────────────────────────────────────── */
// 순수 클라이언트 컴포넌트 — items 를 prop 으로 직접 받고 @duing/hooks 를 쓰지 않으므로 훅 모킹이 불필요하다.
import { HomeFaqAccordion } from '../../app/_components/sections/HomeFaqAccordion';

function makeFaqItem(overrides: Partial<FederationFaqItem> = {}): FederationFaqItem {
  return {
    id: 1,
    categoryId: 1,
    categoryName: '일반',
    question: '동아리 등록은 어떻게 하나요?',
    answer: '총동아리연합회 홈페이지에서 신청서를 제출하면 됩니다.',
    pinned: false,
    ...overrides,
  };
}

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('HomeFaqAccordion', () => {
  it('모든 항목은 접힌 상태(aria-expanded=false)로 시작하고, 클릭한 항목만 펼쳐지며 답변이 노출된다', () => {
    const items = [
      makeFaqItem({ id: 1, question: '첫 번째 질문', answer: '첫 번째 답변' }),
      makeFaqItem({ id: 2, question: '두 번째 질문', answer: '두 번째 답변' }),
    ];
    render(<HomeFaqAccordion items={items} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => expect(button).toHaveAttribute('aria-expanded', 'false'));

    fireEvent.click(buttons[0]!);

    expect(buttons[0]).toHaveAttribute('aria-expanded', 'true');
    expect(buttons[1]).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('첫 번째 답변')).toBeInTheDocument();
  });

  it('펼친 항목의 "자세히 보기" 링크는 /faq?item={id} 로 이동한다', () => {
    const faq = makeFaqItem({ id: 42 });
    render(<HomeFaqAccordion items={[faq]} />);

    fireEvent.click(screen.getByRole('button'));

    const detailLink = screen.getByRole('link', { name: '자세히 보기 →' });
    expect(detailLink).toHaveAttribute('href', '/faq?item=42');
  });
});
