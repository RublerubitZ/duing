import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ClubDetailAbout } from '../../app/clubs/[clubId]/_components/ClubDetailAbout';

describe('ClubDetailAbout', () => {
  it('모든 필드가 비면 컨테이너 자체를 렌더링하지 않는다 (null 반환)', () => {
    const { container } = render(
      <ClubDetailAbout description={null} tagline={null} tags={[]} highlights={[]} majorProjects={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('tagline 만 있으면 h2 만 노출된다', () => {
    render(<ClubDetailAbout description={null} tagline="코드를 두잉" tags={[]} highlights={[]} majorProjects={null} />);
    expect(screen.getByRole('heading', { level: 2, name: '코드를 두잉' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: '이런 사람이 좋아할 거예요' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: '주요 프로젝트' })).toBeNull();
  });

  it('tags 만 있어도 소개 영역이 렌더되고 "#태그" 칩이 노출된다 (기존 "#" 포함 태그는 중복 없이)', () => {
    render(
      <ClubDetailAbout description={null} tagline={null} tags={['AI', '#창업']} highlights={[]} majorProjects={null} />,
    );
    expect(screen.getByText('#AI')).toBeInTheDocument();
    expect(screen.getByText('#창업')).toBeInTheDocument();
    expect(screen.queryByText('##창업')).toBeNull();
  });

  it('highlights 만 있으면 강조 섹션만 노출된다', () => {
    render(
      <ClubDetailAbout
        description={null}
        tagline={null}
        tags={[]}
        highlights={['개발 기초 다진 사람', '동료가 필요한 사람']}
        majorProjects={null}
      />,
    );
    expect(screen.getByRole('heading', { level: 3, name: '이런 사람이 좋아할 거예요' })).toBeInTheDocument();
    expect(screen.getByText('개발 기초 다진 사람')).toBeInTheDocument();
    expect(screen.getByText('동료가 필요한 사람')).toBeInTheDocument();
  });

  it('모든 필드가 있으면 한줄 소개 → 해시태그 → 소개 순으로 모든 섹션이 노출된다', () => {
    render(
      <ClubDetailAbout
        description="설명"
        tagline="태그"
        tags={['AI']}
        highlights={['x']}
        majorProjects="프로젝트"
      />,
    );
    const heading = screen.getByRole('heading', { level: 2, name: '태그' });
    const hashtag = screen.getByText('#AI');
    const descriptionText = screen.getByText('설명');
    expect(heading).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '이런 사람이 좋아할 거예요' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '주요 프로젝트' })).toBeInTheDocument();
    // DOM 순서 검증: 한줄 소개 → 해시태그 → 동아리 소개
    expect(heading.compareDocumentPosition(hashtag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hashtag.compareDocumentPosition(descriptionText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
