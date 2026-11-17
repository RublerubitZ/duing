import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// 폼이 이탈 가드(useUnsavedChangesGuard)를 쓰면서 useRouter 컨텍스트를 요구한다 — 단독 렌더라 스텁한다.
vi.mock('@/app/_lib/useGuardedRouter', () => ({
  useGuardedRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

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

// 소개 편집기의 링크 주소 입력도 폼 안의 <input> 이라, 지연 로드 래퍼만 걷어 내고 실제 편집기를 그린다.
vi.mock('@/app/_components/NoticeRichEditorLazy', async () => {
  const { NoticeRichEditor } = await import('@/app/_components/NoticeRichEditor');
  return { NoticeRichEditorLazy: NoticeRichEditor };
});

// 편집기의 이미지 업로드 훅만 바꾼다 — 이 폼은 이미지 기능을 끄지만 훅은 늘 불린다.
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useFileUploadMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ClubInfoForm } from '../../app/manage/clubs/[clubId]/info/_components/ClubInfoForm';
import type { ClubDetail } from '@duing/types';

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

// 학과·회비 금액·반복 입력까지 폼의 입력이 모두 그려지게 채운 단과대 동아리.
const filledDetail = makeDetail({
  centralClub: false,
  division: null,
  college: 'IT_ENGINEERING',
  department: '컴퓨터공학과',
  feeCycle: 'SEMESTER',
  membershipFeeAmount: 30000,
  snsLinks: [{ platform: 'OTHER', label: 'GitHub', url: 'https://github.com/duing' }],
  faqs: [{ question: '언제 모이나요?', answer: '매주 수요일이에요.', order: 0 }],
  highlights: ['사이드 프로젝트 동료가 필요한 사람'],
  projects: [{ icon: 'CODE', title: '웹 서비스', subtitle: '동아리 홈페이지' }],
});

function renderForm(mode: 'leader' | 'admin', detail: ClubDetail = filledDetail) {
  const mutateAsync = vi.fn().mockResolvedValue(detail);
  render(<ClubInfoForm detail={detail} mode={mode} mutation={{ mutateAsync, isPending: false }} />);
  return mutateAsync;
}

// fireEvent.keyDown 은 기본 동작이 막히면 false 를 돌려준다.
const pressEnter = (element: Element, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(element, { key: 'Enter', ...init });

/** 운영진·총동연 화면이 함께 그리는 입력과 select. 활동 카드의 입력은 '편집'을 눌러야 나온다. */
function sharedFields(): Element[] {
  fireEvent.click(screen.getByRole('button', { name: '편집' }));
  return [
    screen.getByLabelText('학과'),
    screen.getByLabelText('창설년도'),
    screen.getByLabelText('현재 기수'),
    screen.getByLabelText('동아리방 위치'),
    screen.getByRole('radio', { name: '전체 공개' }),
    screen.getByLabelText('주간 활동 횟수'),
    screen.getByLabelText('회비 금액'),
    screen.getByLabelText('한줄 소개'),
    screen.getByPlaceholderText('예: 사이드 프로젝트 동료가 필요한 사람'),
    screen.getByPlaceholderText('프로젝트 제목 (30자 이내)'),
    screen.getByPlaceholderText('부제목 (선택, 40자 이내)'),
    screen.getByDisplayValue('기타'),
    screen.getByPlaceholderText('플랫폼명 (예: GitHub)'),
    screen.getByPlaceholderText('https://...'),
    screen.getByPlaceholderText('질문'),
  ];
}

function expectEnterBlocked(fields: Element[]) {
  for (const field of fields) {
    expect(field instanceof HTMLInputElement || field instanceof HTMLSelectElement).toBe(true);
    expect(pressEnter(field)).toBe(false);
  }
}

describe('ClubInfoForm — 입력·select 의 Enter 로는 저장되지 않는다', () => {
  it('본문·반복 입력, SNS 플랫폼 select, 연락처 공개 라디오에서 Enter 의 기본 동작(폼 제출)을 막는다', () => {
    renderForm('leader');
    expectEnterBlocked(sharedFields());
  });

  it('Shift·Ctrl·Meta·Alt 와 함께 누른 Enter 와 한글을 조합하는 중의 Enter 도 막는다', () => {
    renderForm('leader');
    const location = screen.getByLabelText('동아리방 위치');
    const platform = screen.getByDisplayValue('기타');
    const inits: KeyboardEventInit[] = [
      { shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true },
      { isComposing: true }, { keyCode: 229 },
    ];
    for (const field of [location, platform]) {
      for (const init of inits) expect(pressEnter(field, init)).toBe(false);
    }
  });

  it('입력 값을 고친 뒤 Enter 를 쳐도 저장되지 않고, 저장 버튼을 누르면 한 번 저장된다', async () => {
    const user = userEvent.setup();
    const mutateAsync = renderForm('leader');

    await user.type(screen.getByLabelText('동아리방 위치'), '학생회관 405호{Enter}');
    expect(mutateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ location: '학생회관 405호' });
  });

  it('저장 버튼에 포커스를 두고 누른 Enter 는 지금처럼 저장한다', async () => {
    const user = userEvent.setup();
    const mutateAsync = renderForm('leader');
    fireEvent.change(screen.getByLabelText('동아리방 위치'), { target: { value: '학생회관 405호' } });

    screen.getByRole('button', { name: '저장' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });

  it('태그 입력의 Enter 는 지금처럼 태그를 추가하고 저장하지 않는다', async () => {
    // TagsInput 이 스스로 막으므로 폼의 핸들러 없이도 통과한다 — 태그 추가가 그대로인지 보는 회귀 가드.
    const user = userEvent.setup();
    const mutateAsync = renderForm('leader');

    await user.type(screen.getByPlaceholderText('엔터로 태그 추가'), '코딩{Enter}');
    expect(screen.getByRole('button', { name: '태그 코딩 삭제' })).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('태그 입력에서 한글을 조합하는 중의 Enter 도 막는다 — TagsInput 은 조합 중이면 막지 않고 돌아간다', () => {
    renderForm('leader');
    const tagInput = screen.getByPlaceholderText('엔터로 태그 추가');
    expect(pressEnter(tagInput, { isComposing: true })).toBe(false);
    expect(pressEnter(tagInput, { keyCode: 229 })).toBe(false);
  });

  it('태그를 조합하는 중에 누른 Enter 로 저장되지 않고, 태그도 추가되지 않는다', async () => {
    const user = userEvent.setup();
    const mutateAsync = renderForm('leader');
    fireEvent.change(screen.getByLabelText('동아리방 위치'), { target: { value: '학생회관 405호' } });

    const tagInput = screen.getByPlaceholderText('엔터로 태그 추가');
    await user.click(tagInput);
    fireEvent.compositionStart(tagInput);
    fireEvent.change(tagInput, { target: { value: '코딩' } });
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('button', { name: '태그 코딩 삭제' })).toBeNull();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('소개 편집기의 링크 주소 입력에서 한글을 조합하는 중의 Enter 도 막는다', async () => {
    renderForm('leader');
    fireEvent.click(await screen.findByLabelText('링크'));
    const linkInput = screen.getByLabelText('링크 URL');
    expect(pressEnter(linkInput, { isComposing: true })).toBe(false);
    expect(pressEnter(linkInput, { keyCode: 229 })).toBe(false);
  });

  it('여러 줄 입력의 줄바꿈과 버튼의 Enter 는 막지 않는다', () => {
    renderForm('leader');
    for (const textarea of [screen.getByLabelText('회비 안내 (선택)'), screen.getByPlaceholderText('답변')]) {
      expect(textarea).toBeInstanceOf(HTMLTextAreaElement);
      expect(pressEnter(textarea)).toBe(true);
    }
    const buttons = [
      screen.getByRole('button', { name: '저장' }),
      screen.getByRole('button', { name: '+ SNS 링크 추가' }),
      screen.getByRole('button', { name: '월' }),
      screen.getByRole('radio', { name: '학기당' }),
      screen.getByRole('switch', { name: '회원 기수 관리 사용' }),
    ];
    for (const button of buttons) {
      expect(button).toBeInstanceOf(HTMLButtonElement);
      expect(pressEnter(button)).toBe(true);
    }
  });

  describe('총동연 화면(mode="admin")', () => {
    it('동아리명 입력과 카테고리·단과대학 select, 공통 입력에서 Enter 의 기본 동작을 막는다', () => {
      renderForm('admin');
      expectEnterBlocked([
        screen.getByLabelText('동아리명'),
        screen.getByLabelText('카테고리'),
        screen.getByLabelText('단과대학'),
        ...sharedFields(),
      ]);
    });

    it('중앙동아리의 분과 select 에서도 Enter 의 기본 동작을 막는다', () => {
      renderForm('admin', makeDetail({ centralClub: true, division: '학술' }));
      expectEnterBlocked([screen.getByLabelText('분과')]);
    });

    it('동아리명을 고친 뒤 Enter 를 쳐도 저장되지 않고, 저장 버튼을 누르면 한 번 저장된다', async () => {
      const user = userEvent.setup();
      const mutateAsync = renderForm('admin');
      const nameInput = screen.getByLabelText('동아리명');

      await user.clear(nameInput);
      await user.type(nameInput, '두잉 리브랜드{Enter}');
      expect(mutateAsync).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: '저장' }));
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      expect(mutateAsync).toHaveBeenCalledWith({ name: '두잉 리브랜드' });
    });
  });
});
