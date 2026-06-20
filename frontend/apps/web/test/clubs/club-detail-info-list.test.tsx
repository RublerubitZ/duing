import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ClubDetail } from '@duing/types';

import { ClubDetailInfoList } from '@/app/clubs/[clubId]/_components/ClubDetailInfoList';

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

describe('ClubDetailInfoList — 회장 정보', () => {
  it('회장 이름이 있으면 동아리 회장 행을 표시한다', () => {
    render(<ClubDetailInfoList club={{ ...baseClub, leaderName: '구승율' }} />);

    expect(screen.getByText('동아리 회장')).toBeInTheDocument();
    expect(screen.getByText('구승율')).toBeInTheDocument();
  });

  it('회장이 공석(null)이면 동아리 회장 행을 표시하지 않는다', () => {
    render(<ClubDetailInfoList club={{ ...baseClub, leaderName: null, foundedYear: 2020 }} />);

    expect(screen.queryByText('동아리 회장')).not.toBeInTheDocument();
    expect(screen.getByText('창설년도')).toBeInTheDocument();
  });
});
