import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ClubDetail, MyClubMembership } from '@duing/types';

import { ClubDetailTabs } from '../../app/clubs/[clubId]/_components/ClubDetailTabs';

const memberMembership: MyClubMembership = {
  role: 'MEMBER',
  joinedAt: '2026-01-01T00:00:00Z',
  permissions: {
    canPostNotice: false,
    canEditNotice: false,
    canDeleteNotice: false,
    canPostEvent: false,
    canEditEvent: false,
    canDeleteEvent: false,
  },
};

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
  contactPhone: null,
  contactVisibility: 'PUBLIC',
  activityFrequency: null,
  activeDays: [],
  membershipFeeAmount: null,
  feeCycle: 'NONE',
  tagline: null,
  highlights: [],
  projects: [],
  activeRecruitment: null,
};

describe('ClubDetailTabs', () => {
  it('데이터가 하나도 없으면 컨테이너 자체를 렌더링하지 않는다 (null 반환)', () => {
    const { container } = render(<ClubDetailTabs club={baseClub} photos={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('tags·tagline 만 있으면 소개 탭이 노출되지 않는다 (태그는 히어로 담당, 한줄 소개는 탐색 전용)', () => {
    const { container } = render(
      <ClubDetailTabs
        club={{ ...baseClub, tags: ['AI'], tagline: '한줄 소개' }}
        photos={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('description 만 있으면 소개 탭 1개만 노출', () => {
    render(
      <ClubDetailTabs
        club={{ ...baseClub, description: '본문' }}
        photos={[]}
      />,
    );
    expect(screen.getByRole('tab', { name: '소개' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '활동' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Q&A' })).toBeNull();
    expect(screen.queryByRole('tab', { name: '동아리 상세정보' })).toBeNull();
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
    expect(screen.getByRole('tab', { name: 'Q&A' })).toBeInTheDocument();
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
    expect(screen.getByRole('tab', { name: '소개' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '활동' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Q&A' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '동아리 상세정보' })).toBeInTheDocument();

    // 첫 탭(소개)이 기본 활성이고, 활성 패널 1개만 노출된다
    expect(screen.getByRole('tab', { name: '소개' })).toHaveAttribute('data-state', 'active');
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('membership 이 없으면 공지/일정 탭을 노출하지 않는다', () => {
    render(<ClubDetailTabs club={{ ...baseClub, description: '본문' }} photos={[]} />);
    expect(screen.getByRole('tab', { name: '소개' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '공지' })).toBeNull();
    expect(screen.queryByRole('tab', { name: '일정' })).toBeNull();
  });

  it('projects 만 있는 동아리는 소개 탭이 사라지고 다음 탭이 기본 선택된다', () => {
    render(
      <ClubDetailTabs
        club={{
          ...baseClub,
          description: null,
          highlights: [],
          projects: [{ icon: 'CODE', title: '해커톤', subtitle: null }],
          faqs: [{ question: 'q', answer: 'a', order: 0 }],
        }}
        photos={[]}
        membership={null}
      />,
    );
    // 주요 프로젝트는 랜딩 섹션으로 이관 — 더 이상 소개 탭을 만들지 않는다.
    expect(screen.queryByRole('tab', { name: '소개' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Q&A' })).toHaveAttribute('data-state', 'active');
  });

  it('소개 탭 콘텐츠에 주요 프로젝트가 더 이상 렌더되지 않는다', () => {
    render(
      <ClubDetailTabs
        club={{
          ...baseClub,
          description: '본문',
          projects: [{ icon: 'CODE', title: '해커톤', subtitle: '2박 3일' }],
        }}
        photos={[]}
      />,
    );
    expect(screen.getByRole('tab', { name: '소개' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('본문')).toBeInTheDocument();
    expect(screen.queryByText('해커톤')).toBeNull();
  });

  it('가입한 멤버에게는 공지/일정 탭을 추가로 노출한다', () => {
    render(
      <ClubDetailTabs
        club={{ ...baseClub, description: '본문' }}
        photos={[]}
        membership={memberMembership}
      />,
    );
    // 기본 활성 탭은 여전히 소개 — 공지/일정은 트리거만 노출(비활성 콘텐츠는 마운트되지 않음)
    expect(screen.getByRole('tab', { name: '소개' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '공지' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '일정' })).toBeInTheDocument();
  });
});
