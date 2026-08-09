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

vi.mock('@/app/_components/NoticeRichEditorLazy', () => ({
  NoticeRichEditorLazy: (props: { value: string }) => <div data-testid="rich-editor">{props.value}</div>,
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
    department: null,
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
    feeNote: null,
    highlights: [],
    projects: [],
    useGeneration: false,
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

  it('단과대 동아리(centralClub=false)는 분과 대신 단과대학이 잠금 표시된다', () => {
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

  it('운영진은 학과를 직접 수정할 수 있고 단과대학 입력은 열리지 않는다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(
      <ClubInfoForm
        detail={makeDetail({ centralClub: false, college: 'IT_ENGINEERING', department: '컴퓨터공학과' })}
        mode="leader"
        mutation={{ mutateAsync, isPending: false }}
      />,
    );
    // 단과대학은 총동연 관리 — 리더에게는 select 가 열리지 않는다.
    expect(screen.queryByRole('combobox', { name: '단과대학' })).toBeNull();

    fireEvent.change(screen.getByLabelText('학과'), { target: { value: '소프트웨어학과' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ department: '소프트웨어학과' });
  });

  it('학과를 비우면 빈 문자열로 전송해 서버가 미지정으로 되돌리게 한다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(
      <ClubInfoForm
        detail={makeDetail({ centralClub: false, college: 'IT_ENGINEERING', department: '컴퓨터공학과' })}
        mode="leader"
        mutation={{ mutateAsync, isPending: false }}
      />,
    );
    fireEvent.change(screen.getByLabelText('학과'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ department: '' });
  });

  it('학과 가운데 NBSP 는 서버와 같은 규칙으로 눕혀 보내, 저장값과 폼이 어긋나지 않는다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(
      <ClubInfoForm
        detail={makeDetail({ centralClub: false, college: 'IT_ENGINEERING', department: null })}
        mode="leader"
        mutation={{ mutateAsync, isPending: false }}
      />,
    );
    // 문서에서 복사하면 어절 사이에 NBSP 가 섞여 온다. 서버는 이걸 일반 공백으로 저장하므로
    // 폼도 같은 값을 보내야 다음 저장에서 "변경 없음" 이 걸린다.
    fireEvent.change(screen.getByLabelText('학과'), {
      target: { value: '글로벌\u00A0경영학과' },
    });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ department: '글로벌 경영학과' });
  });

  it('서버가 눕혀 저장한 학과로 다시 열면 같은 값 입력은 변경으로 잡히지 않는다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(
      <ClubInfoForm
        detail={makeDetail({ centralClub: false, college: 'IT_ENGINEERING', department: '글로벌 경영학과' })}
        mode="leader"
        mutation={{ mutateAsync, isPending: false }}
      />,
    );
    fireEvent.change(screen.getByLabelText('학과'), {
      target: { value: '글로벌\u00A0경영학과' },
    });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.getByText('변경된 내용이 없습니다.')).toBeInTheDocument());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('학과 끝 공백은 trim 해서 보내 저장 후 폼이 계속 dirty 로 남지 않는다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(
      <ClubInfoForm
        detail={makeDetail({ centralClub: false, college: 'IT_ENGINEERING', department: '컴퓨터공학과' })}
        mode="leader"
        mutation={{ mutateAsync, isPending: false }}
      />,
    );
    // 서버가 strip 해 저장한 값과 같아지므로 "변경 없음" 으로 판정돼야 한다.
    fireEvent.change(screen.getByLabelText('학과'), { target: { value: '컴퓨터공학과  ' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.getByText('변경된 내용이 없습니다.')).toBeInTheDocument());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('중앙동아리에는 학과 입력이 나타나지 않는다', () => {
    render(
      <ClubInfoForm
        detail={makeDetail({ centralClub: true, division: '학술' })}
        mode="leader"
        mutation={makeMutation()}
      />,
    );
    expect(screen.queryByLabelText('학과')).toBeNull();
  });

  it('회원 기수 관리 스위치를 켜면 페이로드에 useGeneration 이 담긴다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(
      <ClubInfoForm
        detail={makeDetail({ useGeneration: false })}
        mode="leader"
        mutation={{ mutateAsync, isPending: false }}
      />,
    );
    fireEvent.click(screen.getByRole('switch', { name: '회원 기수 관리 사용' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ useGeneration: true });
  });

  it('기수 스위치를 건드리지 않으면 페이로드에 useGeneration 이 없다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(
      <ClubInfoForm detail={makeDetail()} mode="leader" mutation={{ mutateAsync, isPending: false }} />,
    );
    fireEvent.change(screen.getByLabelText('한줄 소개'), { target: { value: '새 소개' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload: AdminUpdateClubPayload = mutateAsync.mock.calls[0]?.[0] ?? {};
    expect(payload).not.toHaveProperty('useGeneration');
  });

  it('회비 안내를 입력하면 페이로드에 feeNote 로 담긴다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(
      <ClubInfoForm detail={makeDetail()} mode="leader" mutation={{ mutateAsync, isPending: false }} />,
    );
    fireEvent.change(screen.getByLabelText('회비 안내 (선택)'), {
      target: { value: '선수 : 학기당 30,000원' },
    });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ feeNote: '선수 : 학기당 30,000원' });
  });

  it('저장된 회비 안내를 지우면 빈 문자열이 전송된다(클리어 규약)', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(
      <ClubInfoForm
        detail={makeDetail({ feeNote: '기존 안내' })}
        mode="leader"
        mutation={{ mutateAsync, isPending: false }}
      />,
    );
    fireEvent.change(screen.getByLabelText('회비 안내 (선택)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ feeNote: '' });
  });

  it('회비 안내를 건드리지 않으면 페이로드에 feeNote 가 담기지 않는다', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
    render(
      <ClubInfoForm
        detail={makeDetail({ feeNote: '기존 안내' })}
        mode="leader"
        mutation={{ mutateAsync, isPending: false }}
      />,
    );
    fireEvent.change(screen.getByLabelText('한줄 소개'), { target: { value: '새 소개' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload: AdminUpdateClubPayload = mutateAsync.mock.calls[0]?.[0] ?? {};
    expect(payload).toHaveProperty('tagline', '새 소개');
    expect(payload).not.toHaveProperty('feeNote');
  });

  it('admin 모드에는 회원 기수 관리 스위치가 렌더되지 않는다', () => {
    render(<ClubInfoForm detail={makeDetail()} mode="admin" mutation={makeMutation()} />);
    expect(screen.queryByRole('switch', { name: '회원 기수 관리 사용' })).toBeNull();
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
