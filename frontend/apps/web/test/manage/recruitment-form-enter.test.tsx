import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecruitmentDetail } from '@duing/types';
import { RecruitmentForm } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';

// 이탈 가드(#1189)가 붙으면 RecruitmentForm 이 useRouter 컨텍스트를 요구한다 — 단독 렌더라 스텁한다.
vi.mock('@/app/_lib/useGuardedRouter', () => ({
  useGuardedRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

/** 절대 미래 날짜는 언젠가 과거가 되는 시한폭탄이라 오늘(폼과 같은 한국 시간) 기준으로 만든다(en-CA = YYYY-MM-DD). */
const KST_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });
function kstIsoDate(daysFromToday: number): string {
  return KST_DATE.format(new Date(Date.now() + daysFromToday * 86_400_000));
}

// 수정 모드 시드 — recruitment-form.test.tsx 의 baseRecruitmentDetail 과 같은 값.
// questionItems 키가 없으면 구 BE 상세로 보고 질문 검증을 건너뛴다(빈 배열이면 "질문 최소 1개"에 걸린다).
const editSeed: RecruitmentDetail = {
  id: 7,
  clubId: 3,
  clubName: '두잉 동아리',
  title: '기존 모집',
  startDate: '2026-05-01',
  endDate: '2026-05-31',
  capacity: 5,
  status: 'OPEN',
  displayStatus: 'OPEN',
  effectivelyOpen: true,
  applicationMode: 'SELF',
  externalFormUrl: null,
  useInterview: false,
  targetRole: 'MEMBER',
  closedAt: null,
  content: null,
  questions: [],
  interviewStartDate: null,
  interviewEndDate: null,
  showApplicantCount: false,
  applicantCount: null,
};

describe('RecruitmentForm — 입력의 Enter 로는 저장되지 않는다', () => {
  beforeEach(() => window.localStorage.clear());

  function renderCreate(onSubmit = vi.fn()) {
    render(<RecruitmentForm mode="create" submitLabel="공개하기" onSubmit={onSubmit} isPending={false} />);
    return onSubmit;
  }

  // fireEvent.keyDown 은 기본 동작이 막히면 false 를 돌려준다.
  const pressEnter = (element: Element, init: KeyboardEventInit = {}) =>
    fireEvent.keyDown(element, { key: 'Enter', ...init });

  it('입력 칸에서 Enter 의 기본 동작(폼 제출)을 막는다', () => {
    renderCreate();
    fireEvent.click(screen.getByRole('button', { name: '+ 질문 추가' }));
    const inputs = [
      screen.getByPlaceholderText('모집 공고 제목을 입력하세요'),
      screen.getByLabelText(/^시작일/),
      screen.getByLabelText(/^모집 인원/),
      screen.getByLabelText(/^상시모집/),
      screen.getByPlaceholderText('질문 1을 입력하세요'),
    ];
    for (const input of inputs) {
      expect(input).toBeInstanceOf(HTMLInputElement);
      expect(pressEnter(input)).toBe(false);
    }

    // 외부 폼 주소 입력은 '외부 폼'으로 전환해야 나온다 — 전환하면 질문 입력은 사라지므로 위에서 먼저 본다.
    fireEvent.click(screen.getByRole('radio', { name: '외부 폼' }));
    fireEvent.click(screen.getByRole('button', { name: '확인하고 전환' }));
    const externalUrl = screen.getByLabelText(/^외부 폼 URL/);
    expect(externalUrl).toBeInstanceOf(HTMLInputElement);
    expect(pressEnter(externalUrl)).toBe(false);
  });

  it('한글을 조합하는 중의 Enter 도 막는다 — 조합을 끝내는 Enter 가 그대로 폼을 제출하는 브라우저가 있다', () => {
    renderCreate();
    const title = screen.getByPlaceholderText('모집 공고 제목을 입력하세요');
    expect(pressEnter(title, { isComposing: true })).toBe(false);
    expect(pressEnter(title, { keyCode: 229 })).toBe(false);
  });

  it('Shift+Enter 도 막는다 — 브라우저는 Shift 를 눌러도 폼을 제출한다', () => {
    renderCreate();
    const title = screen.getByPlaceholderText('모집 공고 제목을 입력하세요');
    expect(pressEnter(title, { shiftKey: true })).toBe(false);
  });

  it('안내문의 줄바꿈과 버튼의 Enter 는 막지 않는다', () => {
    renderCreate();
    const guide = screen.getByPlaceholderText(/^동아리 소개, 가입 후 일정/);
    expect(guide).toBeInstanceOf(HTMLTextAreaElement);
    expect(pressEnter(guide)).toBe(true);
    expect(pressEnter(screen.getByRole('button', { name: '공개하기' }))).toBe(true);
    expect(pressEnter(screen.getByRole('button', { name: '+ 질문 추가' }))).toBe(true);
  });

  it('Enter 가 아닌 키는 막지 않는다', () => {
    renderCreate();
    const title = screen.getByPlaceholderText('모집 공고 제목을 입력하세요');
    for (const key of ['a', 'Tab', ' ']) {
      expect(fireEvent.keyDown(title, { key })).toBe(true);
    }
  });

  it('수정 화면의 입력에서 Enter 를 눌러도 저장되지 않고, 하단 버튼을 누르면 저장된다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RecruitmentForm mode="edit" initialValues={editSeed} submitLabel="수정 저장" onSubmit={onSubmit} isPending={false} />);

    await user.click(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'));
    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '수정 저장' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('공개 확인 창의 버튼에서는 Enter 가 그대로 듣는다', async () => {
    // 확인 창은 포털로 그려지지만 React 트리에서는 폼 안이라, 그 키 이벤트가 폼의 핸들러까지 올라온다.
    renderCreate();
    fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), { target: { value: '가을 모집' } });
    fireEvent.change(screen.getByLabelText(/^시작일/), { target: { value: kstIsoDate(0) } });
    fireEvent.click(screen.getByLabelText(/^상시모집/));
    fireEvent.click(screen.getByRole('radio', { name: '외부 폼' }));
    fireEvent.click(screen.getByRole('button', { name: '확인하고 전환' }));
    fireEvent.change(screen.getByPlaceholderText('https://docs.google.com/forms/...'), { target: { value: 'https://forms.gle/abc' } });
    fireEvent.submit(screen.getByRole('button', { name: '공개하기' }).closest('form')!);
    const publishButton = within(await screen.findByRole('dialog')).getByRole('button', { name: '공개' });
    expect(pressEnter(publishButton)).toBe(true);
  });
});
