import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Pagination } from '@/components/Pagination';

describe('Pagination — 페이지를 바꾸면 새 페이지의 첫머리로', () => {
  afterEach(() => vi.restoreAllMocks());

  it('다른 번호를 누르면 onChange 와 함께 화면 맨 위로 간다', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    const onChange = vi.fn();
    render(<Pagination page={0} totalPages={3} onChange={onChange} />);

    await userEvent.setup().click(screen.getByRole('button', { name: '2' }));

    expect(onChange).toHaveBeenCalledWith(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('이전·다음으로 옮겨도 화면 맨 위로 간다', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    const onChange = vi.fn();
    render(<Pagination page={1} totalPages={3} onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '이전' }));

    expect(onChange.mock.calls).toEqual([[2], [0]]);
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('현재 번호를 다시 누르면 onChange 만 부르고 움직이지 않는다', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    const onChange = vi.fn();
    render(<Pagination page={1} totalPages={3} onChange={onChange} />);

    await userEvent.setup().click(screen.getByRole('button', { name: '2' }));

    expect(onChange).toHaveBeenCalledWith(1);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('표지 안에 있으면 화면 맨 위가 아니라 그 표지의 위로 간다', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    render(
      <section data-pagination-anchor="" data-testid="list-region">
        <Pagination page={0} totalPages={2} onChange={vi.fn()} />
      </section>,
    );
    const listRegion = screen.getByTestId('list-region');
    listRegion.getBoundingClientRect = () => new DOMRect(0, -300, 320, 900);
    const scrollIntoView = vi.fn();
    listRegion.scrollIntoView = scrollIntoView;

    await userEvent.setup().click(screen.getByRole('button', { name: '2' }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
