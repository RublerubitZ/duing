import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ClubDetailAbout } from '../../app/clubs/[clubId]/_components/ClubDetailAbout';

describe('ClubDetailAbout', () => {
  it('모든 필드가 비면 컨테이너 자체를 렌더링하지 않는다 (null 반환)', () => {
    const { container } = render(
      <ClubDetailAbout description={null} tagline={null} highlights={[]} majorProjects={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('tagline 만 있으면 h2 만 노출된다', () => {
    render(<ClubDetailAbout description={null} tagline="코드를 두잉" highlights={[]} majorProjects={null} />);
    expect(screen.getByRole('heading', { level: 2, name: '코드를 두잉' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: '이런 사람이 좋아할 거예요' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: '주요 프로젝트' })).toBeNull();
  });

  it('highlights 만 있으면 강조 섹션만 노출된다', () => {
    render(
      <ClubDetailAbout
        description={null}
        tagline={null}
        highlights={['개발 기초 다진 사람', '동료가 필요한 사람']}
        majorProjects={null}
      />,
    );
    expect(screen.getByRole('heading', { level: 3, name: '이런 사람이 좋아할 거예요' })).toBeInTheDocument();
    expect(screen.getByText('개발 기초 다진 사람')).toBeInTheDocument();
    expect(screen.getByText('동료가 필요한 사람')).toBeInTheDocument();
  });

  it('4개 모두 있으면 모든 섹션이 노출된다', () => {
    render(
      <ClubDetailAbout
        description="설명"
        tagline="태그"
        highlights={['x']}
        majorProjects="프로젝트"
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: '태그' })).toBeInTheDocument();
    expect(screen.getByText('설명')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '이런 사람이 좋아할 거예요' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '주요 프로젝트' })).toBeInTheDocument();
  });
});
