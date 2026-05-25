import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ClubDetail } from '@duing/types';

import { ClubDetailTabs } from '../../app/clubs/[clubId]/_components/ClubDetailTabs';

const baseClub: ClubDetail = {
  id: 1,
  name: 'X',
  category: 'ACADEMIC',
  division: null,
  college: null,
  logoUrl: null,
  status: 'ACTIVE',
  tags: [],
  centralClub: false,
  description: null,
  coverUrl: null,
  snsLinks: [],
  faqs: [],
  leaderId: null,
  leaderName: null,
  photos: [],
  foundedYear: null,
  cohortNumber: null,
  location: null,
  contactEmail: null,
  activityFrequency: null,
  activeDays: [],
  membershipFee: null,
  tagline: null,
  highlights: [],
  majorProjects: null,
  activeRecruitment: null,
};

describe('ClubDetailTabs', () => {
  it('데이터가 하나도 없으면 컨테이너 자체를 렌더링하지 않는다 (null 반환)', () => {
    const { container } = render(<ClubDetailTabs club={baseClub} photos={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('description 만 있으면 소개 탭 1개만 노출', () => {
    render(
      <ClubDetailTabs
        club={{ ...baseClub, description: '본문' }}
        photos={[]}
      />,
    );
    expect(screen.getByRole('button', { name: '소개' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '활동' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Q&A' })).toBeNull();
    expect(screen.queryByRole('button', { name: '동아리 상세정보' })).toBeNull();
  });

  it('faqs 만 있으면 Q&A 탭이 첫 활성 탭이 되고 콘텐츠가 보인다', () => {
    render(
      <ClubDetailTabs
        club={{
          ...baseClub,
          faqs: [{ question: '회비?', answer: '학기당 3만원', order: 0 }],
        }}
        photos={[]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Q&A' })).toBeInTheDocument();
    expect(screen.getByText(/Q\. 회비/)).toBeInTheDocument();
  });

  it('탭 4개가 모두 있으면 4개 모두 노출', () => {
    render(
      <ClubDetailTabs
        club={{
          ...baseClub,
          description: '본문',
          activityFrequency: 2,
          activeDays: ['WEDNESDAY'],
          faqs: [{ question: 'q', answer: 'a', order: 0 }],
          foundedYear: 2020,
        }}
        photos={[]}
      />,
    );
    expect(screen.getByRole('button', { name: '소개' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '활동' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Q&A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '동아리 상세정보' })).toBeInTheDocument();
  });
});
