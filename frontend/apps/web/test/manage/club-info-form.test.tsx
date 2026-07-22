import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/_components/ImageUploader', () => ({
  ImageUploader: (props: { value: string; onChange: (url: string) => void; purpose: string }) => (
    <input
      data-testid={`uploader-${props.purpose}`}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  ),
}));

vi.mock('@/app/_components/ImageWithFallback', () => ({
  ImageWithFallback: (props: { src: string | null | undefined; alt: string }) => (
    <div data-testid={`fallback-${props.alt}`} data-src={props.src ?? ''} />
  ),
}));

import { ClubInfoForm } from '../../app/manage/clubs/[clubId]/info/_components/ClubInfoForm';
import { ActiveDaysToggle } from '../../app/manage/clubs/[clubId]/info/_components/ActiveDaysToggle';
import type { AdminUpdateClubPayload, ClubDetail } from '@duing/types';

function makeDetail(overrides: Partial<ClubDetail> = {}): ClubDetail {
  return {
    id: 1,
    name: '두잉',
    category: 'ACADEMIC',
    division: '학술',
    college: null,
    logoUrl: 'https://cdn.example.com/logo.png',
    status: 'ACTIVE',
    tags: [],
    tagline: null,
    centralClub: true,
    activeRecruitment: null,
    description: null,
    coverUrl: 'https://cdn.example.com/cover.png',
    snsLinks: [],
    faqs: [],
    leaderId: 10,
    leaderName: '회장',
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
    highlights: [],
    projects: [],
    ...overrides,
  };
}

function makeMutation() {
  return { mutateAsync: vi.fn(), isPending: false };
}

describe('ClubInfoForm', () => {
  it('leader 모드는 동아리명·카테고리·분과가 잠금 표시되고 안내 문구가 보인다', () => {
    render(
      <ClubInfoForm
        detail={makeDetail({ centralClub: true, division: '학술' })}
        mode="leader"
        mutation={makeMutation()}
      />,
    );
    expect(screen.getByText(/총동연에서 관리하며 운영진은 수정할 수 없습니다/)).toBeInTheDocument();
    // 동아리명·카테고리·분과 3개가 잠금(자물쇠) 표시된다.
    expect(screen.getAllByLabelText('총동연 관리 항목')).toHaveLength(3);
    // 잠금이므로 편집용 동아리명 입력은 존재하지 않는다.
    expect(screen.queryByLabelText('동아리명')).toBeNull();
  });

  it('officer 모드는 저장 버튼이 노출되지 않는다', () => {
    render(<ClubInfoForm detail={makeDetail()} mode="officer" mutation={makeMutation()} />);
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
  });

  it('admin 모드는 동아리명 입력이 편집 가능하다', () => {
    render(<ClubInfoForm detail={makeDetail()} mode="admin" mutation={makeMutation()} />);
    const nameInput = screen.getByLabelText('동아리명');
    expect(nameInput).toBeEnabled();
    fireEvent.change(nameInput, { target: { value: '새 이름' } });
    expect(nameInput).toHaveValue('새 이름');
  });

  it('한줄 소개 입력 시 프리뷰에 즉시 반영된다', () => {
    render(<ClubInfoForm detail={makeDetail()} mode="leader" mutation={makeMutation()} />);
    fireEvent.change(screen.getByLabelText('한줄 소개'), { target: { value: '즐거운 코딩' } });
    // 프리뷰 카드의 한줄 소개 텍스트로 즉시 반영된다.
    expect(screen.getByText('즐거운 코딩')).toBeInTheDocument();
  });

  it('회비 주기를 학기당으로 바꾸고 금액을 넣으면 페이로드에 쌍으로 담긴다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(
      <ClubInfoForm detail={makeDetail()} mode="leader" mutation={{ mutateAsync, isPending: false }} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: '학기당' }));
    fireEvent.change(screen.getByPlaceholderText('30000'), { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ feeCycle: 'SEMESTER', membershipFeeAmount: 30000 });
  });

  it('회비를 회비 없음으로 바꾸면 페이로드 금액이 null 이다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(
      <ClubInfoForm
        detail={makeDetail({ feeCycle: 'SEMESTER', membershipFeeAmount: 30000 })}
        mode="leader"
        mutation={{ mutateAsync, isPending: false }}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: '회비 없음' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ feeCycle: 'NONE', membershipFeeAmount: null });
  });

  it('leader 모드 페이로드에는 name/category/division/college 키가 없다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(
      <ClubInfoForm detail={makeDetail()} mode="leader" mutation={{ mutateAsync, isPending: false }} />,
    );
    fireEvent.change(screen.getByLabelText('한줄 소개'), { target: { value: '새 소개' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload: AdminUpdateClubPayload = mutateAsync.mock.calls[0]?.[0] ?? {};
    expect(payload).toHaveProperty('tagline', '새 소개');
    expect(payload).not.toHaveProperty('name');
    expect(payload).not.toHaveProperty('category');
    expect(payload).not.toHaveProperty('division');
    expect(payload).not.toHaveProperty('college');
    expect(payload).not.toHaveProperty('clearCollege');
  });

  it('기존 회비 미입력(NONE)이면 재입력 안내가 보이고, 주기를 저장 상태로 바꾸면 사라진다', () => {
    render(
      <ClubInfoForm
        detail={makeDetail({ feeCycle: 'NONE', membershipFeeAmount: null })}
        mode="leader"
        mutation={makeMutation()}
      />,
    );
    expect(screen.getByText(/회비 정보가 새 형식으로 개편되었어요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '학기당' }));
    expect(screen.queryByText(/회비 정보가 새 형식으로 개편되었어요/)).toBeNull();
  });

  it('과동아리(centralClub=false)는 분과 대신 단과대학이 잠금 표시된다', () => {
    render(
      <ClubInfoForm
        detail={makeDetail({ centralClub: false, college: 'IT_ENGINEERING', division: null })}
        mode="leader"
        mutation={makeMutation()}
      />,
    );
    expect(screen.getByText('단과대학')).toBeInTheDocument();
    expect(screen.getByText('IT·공과대학')).toBeInTheDocument();
    expect(screen.queryByText('분과')).toBeNull();
  });
});

describe('ActiveDaysToggle', () => {
  it('요일 클릭 시 선택/해제가 토글된다', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ActiveDaysToggle value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '수' }));
    expect(onChange).toHaveBeenLastCalledWith(['WEDNESDAY']);

    rerender(<ActiveDaysToggle value={['WEDNESDAY']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '수' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('disabled=true 면 클릭이 무시된다', () => {
    const onChange = vi.fn();
    render(<ActiveDaysToggle value={[]} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('button', { name: '월' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
