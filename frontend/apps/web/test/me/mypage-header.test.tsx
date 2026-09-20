import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MyPageHeader } from '../../app/me/_components/MyPageHeader';

function renderHeader() {
  return render(
    <MyPageHeader name="구승율" studentId="22028836" applyCount={0} joinedCount={2} savedCount={5} />,
  );
}

describe('MyPageHeader — 모바일 슬림 밴드, PC 원형 유지', () => {
  it('요약 숫자 3개는 PC 에서만 보인다(모바일 탭 카운트와 중복)', () => {
    renderHeader();
    const stats = screen.getByText('지원 중').closest('.hidden')!;
    expect(stats.className).toContain('hidden');
    expect(stats.className).toContain('sm:flex');
  });

  it('회비 링크는 모바일 우상단·PC 칩 두 자리에 있고 둘 다 /me/fees 로 간다', () => {
    renderHeader();
    const links = screen.getAllByRole('link', { name: /회비/ });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute('href', '/me/fees');
    const [mobileLink, pcChip] = links;
    expect(mobileLink!.className).toContain('sm:hidden');
    expect(pcChip!.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(pcChip!.className).toContain('sm:inline-flex');
  });

  it('이모지(🎓·💳) 대신 아이콘을 쓴다', () => {
    const { container } = renderHeader();
    expect(container.textContent).not.toMatch(/🎓|💳/);
    expect(container.querySelector('svg.lucide-graduation-cap')).not.toBeNull();
    expect(container.querySelectorAll('svg.lucide-credit-card').length).toBeGreaterThan(0);
  });
});
