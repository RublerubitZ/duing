import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { ClubDetail, MyClubMembership, ClubHeroActivity } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
// ClubDetailTabs 가 소개 탭 안에서 ClubDetailHeroActivities(→ useClubHeroActivitiesQuery)를
// 마운트하므로, TanStack 내부는 건드리지 않고 커스텀 훅만 부분 mock 한다(레포 관례).
const mockUseClubHeroActivitiesQuery = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useClubHeroActivitiesQuery: (...args: unknown[]) => mockUseClubHeroActivitiesQuery(...args),
}));

import { ClubDetailTabs } from '../../app/clubs/[clubId]/_components/ClubDetailTabs';

// a 가 b 앞에 오면 true (DOCUMENT_POSITION_FOLLOWING = 4).
function isBefore(first: Element, second: Element): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function makeHero(id: number, displayOrder: number): ClubHeroActivity {
  return {
    id,
    clubPhotoId: id * 10,
    storageKey: `key/${id}.jpg`,
    caption: null,
    width: null,
    height: null,
    title: `히어로${id}`,
    description: `설명${id}`,
    displayOrder,
  };
}

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
  feeNote: null,
  tagline: null,
  highlights: [],
  projects: [],
  useGeneration: false,
  activeRecruitment: null,
};

describe('ClubDetailTabs', () => {
  beforeEach(() => {
    mockUseClubHeroActivitiesQuery.mockReset();
    // 기본은 hero 0개 — 대부분 케이스는 대표 활동 섹션이 조용히 미렌더된다.
    mockUseClubHeroActivitiesQuery.mockReturnValue({ data: [], isLoading: false, isError: false });
  });

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

  it('membership 이 없으면 소식 탭을 노출하지 않는다', () => {
    render(<ClubDetailTabs club={{ ...baseClub, description: '본문' }} photos={[]} />);
    expect(screen.getByRole('tab', { name: '소개' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '소식' })).toBeNull();
    // 옛 공지/일정 탭은 소식으로 통합되어 더 이상 존재하지 않는다
    expect(screen.queryByRole('tab', { name: '공지' })).toBeNull();
    expect(screen.queryByRole('tab', { name: '일정' })).toBeNull();
  });

  it('projects 만 있어도 소개 탭이 노출되고 그 안에 "이런 활동을 해요"가 렌더된다', () => {
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
    // 주요 프로젝트(랜딩 섹션)를 소개 탭 안으로 되돌렸다 — projects 만 있어도 소개 탭이 첫 활성 탭.
    expect(screen.getByRole('tab', { name: '소개' })).toHaveAttribute('data-state', 'active');
    const introPanel = screen.getByRole('tabpanel');
    expect(within(introPanel).getByRole('heading', { name: '이런 활동을 해요' })).toBeInTheDocument();
    expect(within(introPanel).getByText('해커톤')).toBeInTheDocument();
  });

  it('소개 탭에 옛 About 의 "주요 프로젝트" 섹션 문자열은 렌더되지 않는다', () => {
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
    // projects 는 "이런 활동을 해요" 카드로 노출 — 옛 About 의 "주요 프로젝트" 섹션 헤딩은 부재.
    expect(screen.queryByText('주요 프로젝트')).not.toBeInTheDocument();
  });

  it('소개 탭 안 순서: 대표 활동 → 이런 활동을 해요 → 소개글', () => {
    mockUseClubHeroActivitiesQuery.mockReturnValue({
      data: [makeHero(1, 1)],
      isLoading: false,
      isError: false,
    });
    render(
      <ClubDetailTabs
        club={{
          ...baseClub,
          description: '소개 본문',
          projects: [{ icon: 'CODE', title: '해커톤', subtitle: null }],
        }}
        photos={[]}
      />,
    );
    const introPanel = screen.getByRole('tabpanel');
    const heroHeading = within(introPanel).getByRole('heading', { name: '대표 활동' });
    const introHeading = within(introPanel).getByRole('heading', { name: '이런 활동을 해요' });
    const aboutText = within(introPanel).getByText('소개 본문');

    expect(isBefore(heroHeading, introHeading)).toBe(true);
    expect(isBefore(introHeading, aboutText)).toBe(true);
  });

  it('가입한 멤버에게는 소식 탭을 추가로 노출한다', () => {
    render(
      <ClubDetailTabs
        club={{ ...baseClub, description: '본문' }}
        photos={[]}
        membership={memberMembership}
      />,
    );
    // 기본 활성 탭은 여전히 소개 — 소식은 트리거만 노출(비활성 콘텐츠는 마운트되지 않음)
    expect(screen.getByRole('tab', { name: '소개' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '소식' })).toBeInTheDocument();
    // 공지·일정은 소식 하나로 통합됐다
    expect(screen.queryByRole('tab', { name: '공지' })).toBeNull();
    expect(screen.queryByRole('tab', { name: '일정' })).toBeNull();
  });
});
