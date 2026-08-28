import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HomeMobileSearchBar } from '@/app/_components/sections/HomeMobileSearchBar';

describe('HomeMobileSearchBar', () => {
  it('탐색 페이지로 q 파라미터를 보내는 GET 폼이다', () => {
    const { container } = render(<HomeMobileSearchBar />);

    const form = container.querySelector('form');
    expect(form).toHaveAttribute('action', '/clubs');
    expect(form).toHaveAttribute('method', 'get');
    expect(screen.getByRole('searchbox', { name: '동아리 검색' })).toHaveAttribute('name', 'q');
    expect(screen.getByRole('button', { name: /검색/ })).toHaveAttribute('type', 'submit');
  });

  it('시안 위치에 놓이되 스크롤하면 상단에 붙도록 sticky 를 유지한다', () => {
    const { container } = render(<HomeMobileSearchBar />);

    // 시안은 이 바를 히어로 카피 아래 흐름에 두지만, sticky 를 떼면 스크롤 중 검색을 잃는다.
    // 둘을 함께 만족시키는 유일한 지점이라 클래스를 계약으로 고정한다.
    expect(container.firstChild).toHaveClass('sticky', 'top-0');
    // 흐름 안에서는 크롬이 보이면 안 되므로 구분선을 두지 않는다(배경만으로 가린다).
    expect(container.firstChild).not.toHaveClass('border-b');
  });

  it('데스크탑에서는 히어로의 검색 폼이 담당하므로 숨긴다', () => {
    const { container } = render(<HomeMobileSearchBar />);

    expect(container.firstChild).toHaveClass('md:hidden');
  });
});
