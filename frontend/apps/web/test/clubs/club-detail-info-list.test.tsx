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
  department: null,
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

describe('ClubDetailInfoList — 회비', () => {
  it('회비는 주기+금액 조합으로 표시된다', () => {
    render(
      <ClubDetailInfoList club={{ ...baseClub, feeCycle: 'SEMESTER', membershipFeeAmount: 30000 }} />,
    );

    expect(screen.getByText('회비')).toBeInTheDocument();
    expect(screen.getByText('학기당 30,000원')).toBeInTheDocument();
  });

  it('회비 NONE 은 회비 항목을 표시하지 않는다', () => {
    render(
      <ClubDetailInfoList club={{ ...baseClub, feeCycle: 'NONE', membershipFeeAmount: null, foundedYear: 2020 }} />,
    );

    expect(screen.queryByText('회비')).not.toBeInTheDocument();
    expect(screen.getByText('창설년도')).toBeInTheDocument();
  });

  it('회비 안내가 있으면 대표 회비 아래에 줄바꿈·긴 문자열 줄바꿈이 유지된 안내문을 표시한다', () => {
    render(
      <ClubDetailInfoList
        club={{
          ...baseClub,
          feeCycle: 'SEMESTER',
          membershipFeeAmount: 30000,
          feeNote: '선수 : 학기당 30,000원\n매니저 : 학기당 15,000원',
        }}
      />,
    );

    expect(screen.getByText('학기당 30,000원')).toBeInTheDocument();
    const note = screen.getByText(/매니저 : 학기당 15,000원/);
    expect(note).toHaveClass('whitespace-pre-wrap', 'break-words');
  });

  it('회비 NONE 이어도 안내문이 있으면 회비 항목에 안내문만 표시한다', () => {
    render(
      <ClubDetailInfoList
        club={{ ...baseClub, feeNote: '신규회원: 20,000원 / 기존회원: 15,000원' }}
      />,
    );

    expect(screen.getByText('회비')).toBeInTheDocument();
    expect(screen.getByText(/신규회원: 20,000원/)).toBeInTheDocument();
  });
});

describe('ClubDetailInfoList — 대표 연락처 정책', () => {
  it('대표 연락처가 오면 전화번호를 표시한다', () => {
    render(<ClubDetailInfoList club={{ ...baseClub, contactPhone: '010-1234-5678' }} />);

    expect(screen.getByText('대표 연락처')).toBeInTheDocument();
    expect(screen.getByText('010-1234-5678')).toBeInTheDocument();
  });

  it('LOGGED_IN_ONLY 인데 전화번호가 없으면 "로그인 후 확인 가능"을 안내한다', () => {
    render(
      <ClubDetailInfoList club={{ ...baseClub, contactPhone: null, contactVisibility: 'LOGGED_IN_ONLY' }} />,
    );

    expect(screen.getByText('대표 연락처')).toBeInTheDocument();
    expect(screen.getByText('로그인 후 확인 가능')).toBeInTheDocument();
  });

  it('PRIVATE 이면 "대표 연락처 비공개"를 안내한다', () => {
    render(
      <ClubDetailInfoList club={{ ...baseClub, contactPhone: null, contactVisibility: 'PRIVATE' }} />,
    );

    expect(screen.getByText('대표 연락처 비공개')).toBeInTheDocument();
  });

  it('PUBLIC 인데 전화번호가 없으면(회장 미등록) 연락처 항목을 숨긴다', () => {
    render(
      <ClubDetailInfoList
        club={{ ...baseClub, contactPhone: null, contactVisibility: 'PUBLIC', foundedYear: 2020 }}
      />,
    );

    expect(screen.queryByText('대표 연락처')).not.toBeInTheDocument();
    expect(screen.getByText('창설년도')).toBeInTheDocument();
  });

  it('단과대 동아리는 단과대·학과 행을 표시한다', () => {
    render(
      <ClubDetailInfoList
        club={{ ...baseClub, centralClub: false, college: 'GLOBAL_BUSINESS', department: '회계학과' }}
      />,
    );

    expect(screen.getByText('단과대')).toBeInTheDocument();
    expect(screen.getByText('글로벌경영대학')).toBeInTheDocument();
    expect(screen.getByText('학과')).toBeInTheDocument();
    expect(screen.getByText('회계학과')).toBeInTheDocument();
  });

  it('학과가 없는 단과대 동아리는 학과 행을 만들지 않는다', () => {
    render(
      <ClubDetailInfoList
        club={{ ...baseClub, centralClub: false, college: 'GLOBAL_BUSINESS', department: null }}
      />,
    );

    expect(screen.getByText('단과대')).toBeInTheDocument();
    expect(screen.queryByText('학과')).toBeNull();
  });

  it('중앙동아리는 소속 값이 남아 있어도 단과대·학과 행을 그리지 않는다', () => {
    render(
      <ClubDetailInfoList
        club={{ ...baseClub, centralClub: true, college: 'GLOBAL_BUSINESS', department: '회계학과' }}
      />,
    );

    expect(screen.queryByText('단과대')).toBeNull();
    expect(screen.queryByText('학과')).toBeNull();
  });
});
