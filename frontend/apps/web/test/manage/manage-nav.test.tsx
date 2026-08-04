import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

// 선택된 모집의 지원 방식(applicationMode)만 나브 판정에 쓴다 — 도메인 훅 하나만 갈아끼워
// 로딩(모드 미확인)·자체 폼·외부 폼 세 갈래를 직접 태운다.
const mockRecruitmentDetail = vi.fn(() => ({ data: undefined }) as { data: unknown });
vi.mock('@duing/hooks', () => ({
  useRecruitmentDetailQuery: () => mockRecruitmentDetail(),
}));

import { ManageNav } from '@/app/manage/_components/ManageNav';

// 사이드바의 "지원자"·"통계"는 본래 항상 비활성 placeholder 였다.
// 모집 하위 페이지를 보는 중일 때만 해당 모집 컨텍스트로 가는 활성 링크가 되도록 개선했다.
// 외부 폼 모집은 지원서·통계를 쓰지 않으므로 다시 비활성 안내로 돌아간다(스펙 §5.1).

const CLUB_ID = 1;
const RECRUITMENT_ID = 10;

describe('ManageNav — 지원자/통계 컨텍스트 활성화', () => {
  beforeEach(() => {
    mockRecruitmentDetail.mockReturnValue({ data: undefined });
  });

  it('모집 목록 화면에서는 지원자·통계가 비활성 안내(링크 아님)로 표시된다', () => {
    mockUsePathname.mockReturnValue(`/manage/clubs/${CLUB_ID}/recruitments`);
    render(<ManageNav currentClubId={CLUB_ID} />);

    expect(screen.queryByRole('link', { name: '지원자' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '통계' })).not.toBeInTheDocument();
    expect(screen.getAllByText('모집을 먼저 선택하세요')).toHaveLength(2);
  });

  it('신규 작성(/recruitments/new)은 모집 컨텍스트로 보지 않는다', () => {
    mockUsePathname.mockReturnValue(`/manage/clubs/${CLUB_ID}/recruitments/new`);
    render(<ManageNav currentClubId={CLUB_ID} />);

    expect(screen.queryByRole('link', { name: '지원자' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '통계' })).not.toBeInTheDocument();
  });

  it('특정 모집을 보는 중이면 지원자·통계가 해당 모집으로 가는 활성 링크가 된다', () => {
    mockUsePathname.mockReturnValue(`/manage/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}`);
    render(<ManageNav currentClubId={CLUB_ID} />);

    expect(screen.getByRole('link', { name: '지원자' })).toHaveAttribute(
      'href',
      `/manage/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/applicants`,
    );
    expect(screen.getByRole('link', { name: '통계' })).toHaveAttribute(
      'href',
      `/manage/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/stats`,
    );
    expect(screen.queryByText('모집을 먼저 선택하세요')).not.toBeInTheDocument();
  });

  it('지원자 하위 페이지에서도 지원자·통계 링크가 같은 모집 컨텍스트를 유지한다', () => {
    mockUsePathname.mockReturnValue(
      `/manage/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/applicants`,
    );
    render(<ManageNav currentClubId={CLUB_ID} />);

    expect(screen.getByRole('link', { name: '지원자' })).toHaveAttribute(
      'href',
      `/manage/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/applicants`,
    );
    expect(screen.getByRole('link', { name: '통계' })).toHaveAttribute(
      'href',
      `/manage/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/stats`,
    );
  });
});

describe('ManageNav — 외부 폼 모집 동선 차단', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue(`/manage/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}`);
  });

  it('외부 폼 모집이면 지원자·통계를 링크 대신 사용하지 않는다는 안내로 바꾼다', () => {
    mockRecruitmentDetail.mockReturnValue({ data: { applicationMode: 'EXTERNAL' } });
    render(<ManageNav currentClubId={CLUB_ID} />);

    expect(screen.queryByRole('link', { name: '지원자' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '통계' })).not.toBeInTheDocument();
    expect(screen.getAllByText('외부 폼 모집은 사용하지 않아요')).toHaveLength(2);
  });

  it('자체 폼 모집이면 지원자·통계 링크를 그대로 둔다', () => {
    mockRecruitmentDetail.mockReturnValue({ data: { applicationMode: 'SELF' } });
    render(<ManageNav currentClubId={CLUB_ID} />);

    expect(screen.getByRole('link', { name: '지원자' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '통계' })).toBeInTheDocument();
  });

  // fail-open — 모드를 아직 모르는 동안 숨기면 배포 전환기·조회 실패에 멀쩡한 진입점이 사라진다.
  it('모집 정보를 아직 못 받았으면 링크를 유지한다', () => {
    mockRecruitmentDetail.mockReturnValue({ data: undefined });
    render(<ManageNav currentClubId={CLUB_ID} />);

    expect(screen.getByRole('link', { name: '지원자' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '통계' })).toBeInTheDocument();
    expect(screen.queryByText('외부 폼 모집은 사용하지 않아요')).not.toBeInTheDocument();
  });
});

describe('ManageNav — 접힘 상태', () => {
  it('접힘 시 링크의 접근 가능한 이름은 유지되고 title 툴팁이 제공되며, 비활성 안내문은 숨겨진다', () => {
    mockUsePathname.mockReturnValue(`/manage/clubs/${CLUB_ID}`);
    render(<ManageNav currentClubId={CLUB_ID} collapsed />);

    const dashboardLink = screen.getByRole('link', { name: '대시보드' });
    expect(dashboardLink).toHaveAttribute('title', '대시보드');
    expect(screen.queryByText('모집을 먼저 선택하세요')).not.toBeInTheDocument();
  });
});
