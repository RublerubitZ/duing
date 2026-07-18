import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ClubDetailAbout } from '../../app/clubs/[clubId]/_components/ClubDetailAbout';

// 한줄 소개는 탐색 카드 전용, 해시태그는 상세 히어로 담당 — About 은 소개 본문만 다룬다.
describe('ClubDetailAbout', () => {
  it('모든 필드가 비면 컨테이너 자체를 렌더링하지 않는다 (null 반환)', () => {
    const { container } = render(
      <ClubDetailAbout description={null} highlights={[]} majorProjects={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('description 만 있으면 본문만 노출된다', () => {
    render(<ClubDetailAbout description="본문" highlights={[]} majorProjects={null} />);
    expect(screen.getByText('본문')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: '이런 사람이 좋아할 거예요' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: '주요 프로젝트' })).toBeNull();
  });

  it('highlights 만 있으면 강조 섹션만 노출된다', () => {
    render(
      <ClubDetailAbout
        description={null}
        highlights={['개발 기초 다진 사람', '동료가 필요한 사람']}
        majorProjects={null}
      />,
    );
    expect(screen.getByRole('heading', { level: 3, name: '이런 사람이 좋아할 거예요' })).toBeInTheDocument();
    expect(screen.getByText('개발 기초 다진 사람')).toBeInTheDocument();
    expect(screen.getByText('동료가 필요한 사람')).toBeInTheDocument();
  });

  it('모든 필드가 있으면 본문 → 강조 → 주요 프로젝트 순으로 노출된다', () => {
    render(<ClubDetailAbout description="본문" highlights={['x']} majorProjects="프로젝트" />);
    expect(screen.getByText('본문')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '이런 사람이 좋아할 거예요' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '주요 프로젝트' })).toBeInTheDocument();
  });
});
