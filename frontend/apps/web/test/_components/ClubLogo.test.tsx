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

describe('ClubLogo — 썸네일 우선(iOS 깜빡임 P0 §5)', () => {
  const THUMBNAIL = 'https://files.duings.com/club/logo/a-thumb.png';
  const ORIGINAL = 'https://files.duings.com/club/logo/a.png';

  it('thumbnailUrl 이 있으면 그 URL 을 즉시(eager·sync) 그린다', () => {
    render(
      <ClubLogo logoUrl={ORIGINAL} thumbnailUrl={THUMBNAIL} alt="로고">
        <span data-testid="fallback">🏛</span>
      </ClubLogo>,
    );
    const logo = screen.getByAltText('로고');
    expect(logo).toHaveAttribute('src', THUMBNAIL);
    expect(logo).toHaveAttribute('loading', 'eager');
    expect(logo).toHaveAttribute('decoding', 'sync');
    expect(screen.queryByTestId('fallback')).toBeNull();
  });

  it('썸네일이 실패하면 원본으로 물러서되 원본은 지금 속성(lazy·async)대로 그린다 — 원본은 최대 1.3MB 라 동기 디코딩 금지', () => {
    render(
      <ClubLogo logoUrl={ORIGINAL} thumbnailUrl={THUMBNAIL} alt="로고">
        <span data-testid="fallback">🏛</span>
      </ClubLogo>,
    );
    fireEvent.error(screen.getByAltText('로고'));

    const original = screen.getByAltText('로고');
    expect(original).toHaveAttribute('src', ORIGINAL);
    expect(original).toHaveAttribute('loading', 'lazy');
    expect(original).toHaveAttribute('decoding', 'async');
    expect(screen.queryByTestId('fallback')).toBeNull();
  });

  it('썸네일·원본이 모두 실패하면 children 폴백이다', () => {
    render(
      <ClubLogo logoUrl={ORIGINAL} thumbnailUrl={THUMBNAIL} alt="로고">
        <span data-testid="fallback">🏛</span>
      </ClubLogo>,
    );
    fireEvent.error(screen.getByAltText('로고'));
    fireEvent.error(screen.getByAltText('로고'));

    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    expect(screen.queryByAltText('로고')).toBeNull();
  });

  it('썸네일이 원본과 같은 URL(작은 원본 등)이면 원본 속성(lazy·async)으로 한 번만 시도하고, 실패하면 바로 children 폴백이다', () => {
    render(
      <ClubLogo logoUrl={ORIGINAL} thumbnailUrl={ORIGINAL} alt="로고">
        <span data-testid="fallback">🏛</span>
      </ClubLogo>,
    );
    // 서버는 작은 원본(스펙 §4.2) 등에 원본 URL 을 그대로 준다(백엔드 후속이 들어오면 넓은 색역 로고도) — 크기를 알 수 없어 동기 디코딩하지 않는다.
    const logo = screen.getByAltText('로고');
    expect(logo).toHaveAttribute('src', ORIGINAL);
    expect(logo).toHaveAttribute('loading', 'lazy');
    expect(logo).toHaveAttribute('decoding', 'async');

    fireEvent.error(logo);
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    expect(screen.queryByAltText('로고')).toBeNull();
  });

  it('logoUrl 이 null 이면 썸네일이 있어도 무시하고 처음부터 children(이니셜) 폴백이다 — 백엔드 계약(#1473)', () => {
    render(
      <ClubLogo logoUrl={null} thumbnailUrl={THUMBNAIL} alt="로고">
        <span data-testid="fallback">🏛</span>
      </ClubLogo>,
    );
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    expect(screen.queryByAltText('로고')).toBeNull();
  });

  it.each([undefined, null])(
    'thumbnailUrl 이 %s 이면(구 응답·미생성) 원본을 지금처럼 lazy·async 로 그린다 — fail-open',
    (thumbnailUrl) => {
      render(
        <ClubLogo logoUrl={ORIGINAL} thumbnailUrl={thumbnailUrl} alt="로고">
          <span data-testid="fallback">🏛</span>
        </ClubLogo>,
      );
      const logo = screen.getByAltText('로고');
      expect(logo).toHaveAttribute('src', ORIGINAL);
      expect(logo).toHaveAttribute('loading', 'lazy');
      expect(logo).toHaveAttribute('decoding', 'async');
    },
  );

  it('썸네일이 실패한 뒤 새 썸네일 URL 로 바뀌면(로고 교체) 다시 썸네일부터 시도한다', () => {
    const { rerender } = render(
      <ClubLogo logoUrl={ORIGINAL} thumbnailUrl={THUMBNAIL} alt="로고">
        <span data-testid="fallback">🏛</span>
      </ClubLogo>,
    );
    fireEvent.error(screen.getByAltText('로고'));
    expect(screen.getByAltText('로고')).toHaveAttribute('src', ORIGINAL);

    rerender(
      <ClubLogo
        logoUrl="https://files.duings.com/club/logo/b.png"
        thumbnailUrl="https://files.duings.com/club/logo/b-thumb.png"
        alt="로고"
      >
        <span data-testid="fallback">🏛</span>
      </ClubLogo>,
    );
    const replacedLogo = screen.getByAltText('로고');
    expect(replacedLogo).toHaveAttribute('src', 'https://files.duings.com/club/logo/b-thumb.png');
    expect(replacedLogo).toHaveAttribute('loading', 'eager');
  });
});
