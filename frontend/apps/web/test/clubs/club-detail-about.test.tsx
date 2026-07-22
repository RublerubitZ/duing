import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ClubProject } from '@duing/types';

import { ClubDetailAbout } from '../../app/clubs/[clubId]/_components/ClubDetailAbout';

// 한줄 소개는 탐색 카드 전용, 해시태그는 상세 히어로 담당 — About 은 소개 본문만 다룬다.
describe('ClubDetailAbout', () => {
  it('모든 필드가 비면 컨테이너 자체를 렌더링하지 않는다 (null 반환)', () => {
    const { container } = render(
      <ClubDetailAbout description={null} highlights={[]} projects={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('description 만 있으면 본문만 노출된다', () => {
    render(<ClubDetailAbout description="본문" highlights={[]} projects={[]} />);
    expect(screen.getByText('본문')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: '이런 사람이 좋아할 거예요' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: '주요 프로젝트' })).toBeNull();
  });

  it('highlights 만 있으면 강조 섹션만 노출된다', () => {
    render(
      <ClubDetailAbout
        description={null}
        highlights={['개발 기초 다진 사람', '동료가 필요한 사람']}
        projects={[]}
      />,
    );
    expect(screen.getByRole('heading', { level: 3, name: '이런 사람이 좋아할 거예요' })).toBeInTheDocument();
    expect(screen.getByText('개발 기초 다진 사람')).toBeInTheDocument();
    expect(screen.getByText('동료가 필요한 사람')).toBeInTheDocument();
  });

  it('모든 필드가 있으면 본문 → 강조 → 주요 프로젝트 순으로 노출된다', () => {
    const projects: ClubProject[] = [{ icon: 'CODE', title: '프로젝트', subtitle: null }];
    render(<ClubDetailAbout description="본문" highlights={['x']} projects={projects} />);
    expect(screen.getByText('본문')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '이런 사람이 좋아할 거예요' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '주요 프로젝트' })).toBeInTheDocument();
  });

  it('프로젝트 카드가 제목·부제목·아이콘과 함께 렌더된다', () => {
    const projects: ClubProject[] = [{ icon: 'CODE', title: '해커톤', subtitle: '2박 3일' }];
    const { container } = render(
      <ClubDetailAbout description={null} highlights={[]} projects={projects} />,
    );
    expect(screen.getByRole('heading', { level: 3, name: '주요 프로젝트' })).toBeInTheDocument();
    expect(screen.getByText('해커톤')).toBeInTheDocument();
    expect(screen.getByText('2박 3일')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('subtitle 이 null 이면 부제목 줄을 렌더하지 않는다', () => {
    const projects: ClubProject[] = [{ icon: 'CODE', title: '해커톤', subtitle: null }];
    render(<ClubDetailAbout description={null} highlights={[]} projects={projects} />);
    const title = screen.getByText('해커톤');
    const card = title.closest('li');
    expect(card).not.toBeNull();
    // 아이콘(svg)은 텍스트가 없으므로 카드 텍스트는 제목뿐이어야 한다.
    expect(card?.textContent).toBe('해커톤');
  });

  it('프로젝트가 없으면 주요 프로젝트 섹션을 렌더하지 않는다', () => {
    render(<ClubDetailAbout description="본문" highlights={[]} projects={[]} />);
    expect(screen.queryByRole('heading', { level: 3, name: '주요 프로젝트' })).toBeNull();
  });
});
