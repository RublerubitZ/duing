import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClubLogo } from '../../app/_components/ClubLogo';

describe('ClubLogo', () => {
  it('logoUrl 이 null 이면 children 을 렌더한다', () => {
    render(
      <ClubLogo logoUrl={null} alt="로고">
        <span data-testid="fallback">🏛</span>
      </ClubLogo>,
    );
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    expect(screen.queryByAltText('로고')).toBeNull();
  });

  it('logoUrl 이 있으면 img 를 렌더하고 children 은 노출되지 않는다', () => {
    render(
      <ClubLogo logoUrl="https://example.com/logo.png" alt="로고">
        <span data-testid="fallback">🏛</span>
      </ClubLogo>,
    );
    expect(screen.getByAltText('로고')).toHaveAttribute('src', 'https://example.com/logo.png');
    expect(screen.queryByTestId('fallback')).toBeNull();
  });

  it('img 의 onError 가 발생하면 children fallback 으로 교체된다', () => {
    render(
      <ClubLogo logoUrl="https://example.com/broken.png" alt="로고">
        <span data-testid="fallback">🏛</span>
      </ClubLogo>,
    );
    const img = screen.getByAltText('로고');
    fireEvent.error(img);
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    expect(screen.queryByAltText('로고')).toBeNull();
  });

  it('logoUrl 이 새 URL 로 바뀌면 onError 상태가 자동으로 reset 되어 img 가 다시 렌더된다', () => {
    const { rerender } = render(
      <ClubLogo logoUrl="https://example.com/broken.png" alt="로고">
        <span data-testid="fallback">🏛</span>
      </ClubLogo>,
    );
    fireEvent.error(screen.getByAltText('로고'));
    expect(screen.getByTestId('fallback')).toBeInTheDocument();

    rerender(
      <ClubLogo logoUrl="https://example.com/new.png" alt="로고">
        <span data-testid="fallback">🏛</span>
      </ClubLogo>,
    );
    expect(screen.getByAltText('로고')).toHaveAttribute('src', 'https://example.com/new.png');
    expect(screen.queryByTestId('fallback')).toBeNull();
  });
});
