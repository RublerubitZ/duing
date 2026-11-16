import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecruitmentDetail } from '@duing/types';
import { RecruitmentForm } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';
import {
  loadRecruitmentDraft,
  saveRecruitmentDraft,
} from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentDraft';

// 임시저장은 사용자·동아리 쌍으로 보관한다 — 프롭으로도 넘기므로 참조가 고정된 상수 하나를 쓴다.
const DRAFT_OWNER = { userId: 1, clubId: 7 };

// 이탈 가드(#1189)가 붙으면 RecruitmentForm 이 useRouter 컨텍스트를 요구한다 — 단독 렌더라 스텁한다
// (recruitment-form.test.tsx 와 같은 스텁, 병합 순서와 무관하게 통과하도록 선반영).
vi.mock('@/app/_lib/useGuardedRouter', () => ({
  useGuardedRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

/** 절대 미래 날짜는 언젠가 과거가 되는 시한폭탄이라 오늘(폼과 같은 한국 시간) 기준으로 만든다(en-CA = YYYY-MM-DD). */
const KST_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });
function kstIsoDate(daysFromToday: number): string {
  return KST_DATE.format(new Date(Date.now() + daysFromToday * 86_400_000));
}

/** 등록 폼을 공개할 수 있는 최소 입력으로 채워 제출하고, 공개 확인 창에서 '공개'를 누른다. */
async function fillAndPublishCreateForm() {
  fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), { target: { value: '가을 모집' } });
  fireEvent.change(screen.getByLabelText(/^시작일/), { target: { value: kstIsoDate(0) } });
  fireEvent.click(screen.getByLabelText(/^상시모집/));
  fireEvent.click(screen.getByRole('radio', { name: '외부 폼' }));
  fireEvent.click(screen.getByRole('button', { name: '확인하고 전환' }));
  fireEvent.change(screen.getByPlaceholderText('https://docs.google.com/forms/...'), { target: { value: 'https://forms.gle/abc' } });
  fireEvent.submit(screen.getByRole('button', { name: '공개하기' }).closest('form')!);
  // '공개'를 누른 직후에는 창이 아직 열려 있어 폼이 aria-hidden 아래다 — 부른 쪽은 폼 안을 getByRole 로 바로 찾지 않는다.
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '공개' }));
}

/**
 * jsdom 은 레이아웃이 없어 모든 사각형이 0 이다(= 폼 맨 위는 기본으로 화면 안, top 0).
 * 아래로 스크롤한 상황은 폼의 top 에 음수를 심어 만든다.
 */
function placeFormTop(form: HTMLElement, top: number) {
  vi.spyOn(form, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, top, 800, 2400));
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

describe('RecruitmentForm 오류 표시', () => {
  beforeEach(() => window.localStorage.clear());

  it('빈 폼을 제출하면 요약 카드와 필드별 오류가 뜨고 onSubmit 은 호출되지 않는다', async () => {
    const onSubmit = vi.fn();
    render(<RecruitmentForm mode="create" submitLabel="공개하기" onSubmit={onSubmit} isPending={false} />);
    fireEvent.submit(screen.getByRole('button', { name: '공개하기' }).closest('form')!);
    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent(/곳을 확인해 주세요/);
    expect(screen.getByText('제목은 필수 입력값입니다.')).toBeInTheDocument();
    // 미입력은 "형식이 올바르지 않다" 가 아니다 — 빈 날짜에는 입력을 청하는 문구가 나가야 한다.
    expect(screen.getByText('시작일을 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByText('종료일을 입력해 주세요.')).toBeInTheDocument();
    expect(screen.queryByText('날짜 형식이 올바르지 않습니다.')).not.toBeInTheDocument();
    // 요약 항목은 필드 라벨을 앞에 달아 같은 문구를 쓰는 필드끼리 구분된다.
    expect(
      screen.getByRole('button', { name: '제목 · 제목은 필수 입력값입니다.' }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('모집 공고 제목을 입력하세요')).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('검증을 통과하면 공개 확인 모달을 거쳐 onSubmit 이 호출된다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RecruitmentForm mode="create" submitLabel="공개하기" onSubmit={onSubmit} isPending={false} />);
    fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), { target: { value: '가을 모집' } });
    fireEvent.change(screen.getByLabelText(/^시작일/), { target: { value: kstIsoDate(0) } });
    fireEvent.click(screen.getByLabelText(/^상시모집/));
    fireEvent.click(screen.getByRole('radio', { name: '외부 폼' }));
    fireEvent.click(screen.getByRole('button', { name: '확인하고 전환' }));
    fireEvent.change(screen.getByPlaceholderText('https://docs.google.com/forms/...'), { target: { value: 'https://forms.gle/abc' } });
    fireEvent.submit(screen.getByRole('button', { name: '공개하기' }).closest('form')!);
    const dialog = await screen.findByRole('dialog', { name: '지금부터 학생에게 공개돼요' });
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole('button', { name: '공개하기' }).closest('form')!);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '공개' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('임시저장이 있으면 배너가 뜨고 이어서 쓰기로 값이 복원된다', async () => {
    saveRecruitmentDraft(DRAFT_OWNER, { title: '이어쓰기 제목', capacity: 3 });
    render(<RecruitmentForm mode="create" draftOwner={DRAFT_OWNER} submitLabel="공개하기" onSubmit={vi.fn()} isPending={false} />);
    fireEvent.click(await screen.findByRole('button', { name: '이어서 쓰기' }));
    expect(screen.getByPlaceholderText('모집 공고 제목을 입력하세요')).toHaveValue('이어쓰기 제목');
  });

  it('입력을 멈추면 1.5초 뒤 임시저장된다', () => {
    vi.useFakeTimers();
    try {
      render(
        <RecruitmentForm mode="create" draftOwner={DRAFT_OWNER} submitLabel="공개하기" onSubmit={vi.fn()} isPending={false} />,
      );
      fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), {
        target: { value: '자동 저장 제목' },
      });
      // debounce 전에는 아직 아무것도 쓰지 않는다.
      expect(loadRecruitmentDraft(DRAFT_OWNER)).toBeNull();

      act(() => vi.advanceTimersByTime(1500));

      expect(loadRecruitmentDraft(DRAFT_OWNER)?.values.title).toBe('자동 저장 제목');
    } finally {
      vi.useRealTimers();
    }
  });

  // 배너를 무시하고 계속 쓰는 쪽이 더 흔하다 — 그 입력을 통째로 잃느니 옛 저장본을 덮는다.
  it('배너를 무시하고 입력하면 배너가 사라지고 자동 저장이 다시 돌아간다', () => {
    vi.useFakeTimers();
    try {
      saveRecruitmentDraft(DRAFT_OWNER, { title: '옛 저장본' });
      render(
        <RecruitmentForm mode="create" draftOwner={DRAFT_OWNER} submitLabel="공개하기" onSubmit={vi.fn()} isPending={false} />,
      );
      expect(screen.getByRole('button', { name: '이어서 쓰기' })).toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), {
        target: { value: '배너 무시하고 쓴 제목' },
      });

      expect(screen.queryByRole('button', { name: '이어서 쓰기' })).not.toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1500));

      expect(loadRecruitmentDraft(DRAFT_OWNER)?.values.title).toBe('배너 무시하고 쓴 제목');
    } finally {
      vi.useRealTimers();
    }
  });

  // 배너를 무시하고 한 글자 쳤다가 debounce 안에 지우면 이 세션은 아직 아무것도 저장하지 않았다.
  // 그 상태에서 옛 저장본까지 지우면 배너도 이미 접힌 뒤라 되살릴 길이 없다.
  it('이 세션에서 저장한 적 없는 초안은 되돌림으로 지워지지 않는다', () => {
    vi.useFakeTimers();
    try {
      saveRecruitmentDraft(DRAFT_OWNER, { title: '옛 저장본', capacity: 5 });
      render(
        <RecruitmentForm mode="create" draftOwner={DRAFT_OWNER} submitLabel="공개하기" onSubmit={vi.fn()} isPending={false} />,
      );
      const titleInput = screen.getByPlaceholderText('모집 공고 제목을 입력하세요');
      fireEvent.change(titleInput, { target: { value: 'a' } });
      // 1.5초가 지나기 전에 되돌린다 — 저장은 한 번도 일어나지 않았다.
      fireEvent.change(titleInput, { target: { value: '' } });

      act(() => vi.advanceTimersByTime(1500));

      expect(loadRecruitmentDraft(DRAFT_OWNER)?.values.title).toBe('옛 저장본');
      expect(loadRecruitmentDraft(DRAFT_OWNER)?.values.capacity).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  // 자동 저장의 "초기값으로 돌아왔으면 지운다" 기준선은 마운트 시 시드값이어야 한다. 복원값이 기준선이
  // 되면 복원 후 한 글자 쳤다 지우는 것만으로 저장본이 사라져 새로고침 시 복원할 내용이 없어진다.
  it('이어서 쓰기로 복원한 값은 편집을 되돌려도 지워지지 않는다', () => {
    vi.useFakeTimers();
    try {
      saveRecruitmentDraft(DRAFT_OWNER, { title: '복원할 제목' });
      render(
        <RecruitmentForm mode="create" draftOwner={DRAFT_OWNER} submitLabel="공개하기" onSubmit={vi.fn()} isPending={false} />,
      );
      fireEvent.click(screen.getByRole('button', { name: '이어서 쓰기' }));

      const titleInput = screen.getByPlaceholderText('모집 공고 제목을 입력하세요');
      fireEvent.change(titleInput, { target: { value: '복원할 제목!' } });
      fireEvent.change(titleInput, { target: { value: '복원할 제목' } });

      act(() => vi.advanceTimersByTime(1500));

      expect(loadRecruitmentDraft(DRAFT_OWNER)).not.toBeNull();
      expect(loadRecruitmentDraft(DRAFT_OWNER)?.values.title).toBe('복원할 제목');
    } finally {
      vi.useRealTimers();
    }
  });

  // 이미 고친 곳이 계속 붉게 남아 있으면 남은 오류를 찾아 헤맨다 — 필드를 고치는 순간 지운다.
  it('오류 난 필드를 고치면 인라인 오류와 요약 개수가 바로 줄어든다', async () => {
    render(<RecruitmentForm mode="create" submitLabel="공개하기" onSubmit={vi.fn()} isPending={false} />);
    fireEvent.submit(screen.getByRole('button', { name: '공개하기' }).closest('form')!);

    const summary = await screen.findByRole('alert');
    const errorCount = Number(/(\d+)곳/.exec(summary.textContent ?? '')?.[1]);
    expect(errorCount).toBeGreaterThan(1);

    fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), {
      target: { value: '가을 모집' },
    });

    expect(screen.queryByText('제목은 필수 입력값입니다.')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(`${errorCount - 1}곳을 확인해 주세요`);
    expect(screen.getByPlaceholderText('모집 공고 제목을 입력하세요')).not.toHaveAttribute('aria-invalid');
  });

  // 시작일이 미래면 지금 공개되는 게 아니다 — "지금부터" 라고 하면 거짓말이 된다.
  it('시작일이 미래면 공개 확인 모달이 실제 공개일을 말한다', async () => {
    render(<RecruitmentForm mode="create" submitLabel="공개하기" onSubmit={vi.fn()} isPending={false} />);
    const startDate = kstIsoDate(5);
    fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), { target: { value: '가을 모집' } });
    fireEvent.change(screen.getByLabelText(/^시작일/), { target: { value: startDate } });
    fireEvent.click(screen.getByLabelText(/^상시모집/));
    fireEvent.click(screen.getByRole('radio', { name: '외부 폼' }));
    fireEvent.click(screen.getByRole('button', { name: '확인하고 전환' }));
    fireEvent.change(screen.getByPlaceholderText('https://docs.google.com/forms/...'), {
      target: { value: 'https://forms.gle/abc' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '공개하기' }).closest('form')!);

    const [, month, day] = startDate.split('-').map(Number);
    expect(
      await screen.findByRole('dialog', { name: `${month}월 ${day}일부터 학생에게 공개돼요` }),
    ).toBeInTheDocument();
  });

  // 오늘은 기기 시간대가 아니라 한국 시간이다 — 스키마·백엔드(seoulClock)와 같은 기준(TIMEZONE.md).
  describe('오늘은 한국 시간 날짜 — 뉴욕 기기(아직 10/31)에서 한국 11/01 00:10', () => {
    const originalTz = process.env.TZ;
    beforeEach(() => {
      process.env.TZ = 'America/New_York';
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-01T00:10:00+09:00'));
    });
    afterEach(() => {
      vi.useRealTimers();
      // undefined 를 대입하면 문자열 "undefined" 가 들어가 UTC 로 동작한다 — 원래 없었으면 지운다.
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it('종료일 입력의 최솟값은 한국 오늘(11/01)이다', () => {
      render(<RecruitmentForm mode="create" submitLabel="공개하기" onSubmit={vi.fn()} isPending={false} />);

      expect(screen.getByLabelText(/^종료일/)).toHaveAttribute('min', '2026-11-01');
    });

    it('시작일이 한국 오늘(11/01)이면 공개 확인 모달은 "지금부터" 다', async () => {
      render(<RecruitmentForm mode="create" submitLabel="공개하기" onSubmit={vi.fn()} isPending={false} />);
      fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), { target: { value: '가을 모집' } });
      fireEvent.change(screen.getByLabelText(/^시작일/), { target: { value: '2026-11-01' } });
      fireEvent.click(screen.getByLabelText(/^상시모집/));
      fireEvent.click(screen.getByRole('radio', { name: '외부 폼' }));
      fireEvent.click(screen.getByRole('button', { name: '확인하고 전환' }));
      fireEvent.change(screen.getByPlaceholderText('https://docs.google.com/forms/...'), {
        target: { value: 'https://forms.gle/abc' },
      });
      fireEvent.submit(screen.getByRole('button', { name: '공개하기' }).closest('form')!);

      expect(await screen.findByRole('dialog', { name: '지금부터 학생에게 공개돼요' })).toBeInTheDocument();
    });
  });

  // 시트에 설명이 없으면 Radix 가 콘솔 경고를 내고, 스크린리더는 무엇이 열렸는지 알 수 없다.
  it('미리보기 시트에 스크린리더용 설명이 붙는다', async () => {
    render(<RecruitmentForm mode="create" submitLabel="공개하기" onSubmit={vi.fn()} isPending={false} />);
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));

    expect(await screen.findByRole('dialog')).toHaveAccessibleDescription(
      '작성 중인 모집을 지원자 시점으로 미리 봅니다.',
    );
  });

  it('하단 줄은 오류 문구와 제출 버튼을 한 줄에 두고 줄바꿈을 허용한다', async () => {
    const longMessage =
      '취소하지 않은 면접 라운드가 있어 면접을 끌 수 없습니다. 초안은 폐기하고 진행 중인 라운드는 취소한 뒤 다시 시도해주세요(확정된 라운드가 있으면 끌 수 없습니다).';
    const onSubmit = vi.fn().mockRejectedValue(new Error(longMessage));
    render(<RecruitmentForm mode="create" submitLabel="공개하기" onSubmit={onSubmit} isPending={false} />);
    // 확인 창이 열려 있는 동안 폼은 aria-hidden 아래다 — 하단 줄은 창을 열기 전에 잡아 둔다.
    const submitRow = screen.getByRole('button', { name: '공개하기' }).parentElement!;
    await fillAndPublishCreateForm();

    // 줄바꿈을 허용해야 긴 오류 문구 옆에서 버튼이 찌그러지지 않고 다음 줄로 내려간다.
    // jsdom 은 레이아웃을 재지 못한다 — 같은 줄인지와 줄바꿈 허용만 단언하고, 실제 배치는 브라우저에서 잰다.
    const errorText = await within(submitRow).findByText(longMessage);
    expect(errorText.parentElement).toBe(submitRow);
    expect(submitRow).toHaveClass('flex-wrap');
  });

  it('등록이 거절되면 폼 맨 위 알림 카드 하나에 문구가 뜬다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('이미 진행 중인 모집이 있습니다.'));
    render(<RecruitmentForm mode="create" submitLabel="공개하기" onSubmit={onSubmit} isPending={false} />);
    await fillAndPublishCreateForm();

    // 알림 영역은 한 곳이다 — 폼 맨 위가 화면에 보이면 위쪽 카드가 알림이고, 하단 문구에는 role 이 없다.
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('이미 진행 중인 모집이 있습니다.');
    // 머리줄 버튼으로 저장한 사용자가 스크롤 없이 보도록 첫 입력보다 앞에 둔다.
    const titleInput = screen.getByPlaceholderText('모집 공고 제목을 입력하세요');
    expect(alerts[0]!.compareDocumentPosition(titleInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('수정이 거절되면 폼 맨 위 알림 카드에 문구가 뜬다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('취소하지 않은 면접 라운드가 있어 면접을 끌 수 없습니다.'));
    render(<RecruitmentForm mode="edit" initialValues={editSeed} submitLabel="수정 저장" onSubmit={onSubmit} isPending={false} />);
    fireEvent.submit(screen.getByRole('button', { name: '수정 저장' }).closest('form')!);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('취소하지 않은 면접 라운드가 있어 면접을 끌 수 없습니다.');
    const titleInput = screen.getByPlaceholderText('모집 공고 제목을 입력하세요');
    expect(alert.compareDocumentPosition(titleInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('거절 뒤 다시 제출을 시작하면 알림 카드가 사라진다', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error('저장 거절'))
      .mockReturnValueOnce(new Promise<void>(() => {}));
    render(<RecruitmentForm mode="edit" initialValues={editSeed} submitLabel="수정 저장" onSubmit={onSubmit} isPending={false} />);
    const form = screen.getByRole('button', { name: '수정 저장' }).closest('form')!;
    fireEvent.submit(form);
    // 먼저 카드가 있어야 한다 — 이 단언이 없으면 구현이 없어도 통과한다.
    expect(await screen.findByRole('alert')).toHaveTextContent('저장 거절');

    fireEvent.submit(form);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('아래로 스크롤해 폼 맨 위가 화면 밖일 때 낸 제출이 거절되면 위쪽 카드 없이 하단 문구가 알림이 된다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('저장 거절'));
    render(<RecruitmentForm mode="edit" initialValues={editSeed} submitLabel="수정 저장" onSubmit={onSubmit} isPending={false} />);
    const submitRow = screen.getByRole('button', { name: '수정 저장' }).parentElement!;
    const form = submitRow.closest('form')!;
    placeFormTop(form, -1500);
    fireEvent.submit(form);

    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    // 화면 밖 위쪽에 카드를 넣으면 보이지도 않고, 스크롤 보정이 없는 브라우저에서는 보던 화면이 카드 높이만큼 밀린다.
    expect(alerts[0]!.parentElement).toBe(submitRow);
    expect(screen.getAllByText('저장 거절')).toHaveLength(1);
  });

  it('폼 맨 위가 화면 위로 1px 만 지나가도 위쪽 카드를 그리지 않는다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('저장 거절'));
    render(<RecruitmentForm mode="edit" initialValues={editSeed} submitLabel="수정 저장" onSubmit={onSubmit} isPending={false} />);
    const submitRow = screen.getByRole('button', { name: '수정 저장' }).parentElement!;
    const form = submitRow.closest('form')!;
    placeFormTop(form, -1);
    fireEvent.submit(form);

    expect(await within(submitRow).findByRole('alert')).toHaveTextContent('저장 거절');
    expect(screen.getAllByText('저장 거절')).toHaveLength(1);
  });

  it('스크롤한 상태에서 거절된 뒤 폼 맨 위가 화면에 보일 때 다시 거절되면 위쪽 카드가 뜬다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('저장 거절'));
    render(<RecruitmentForm mode="edit" initialValues={editSeed} submitLabel="수정 저장" onSubmit={onSubmit} isPending={false} />);
    const submitRow = screen.getByRole('button', { name: '수정 저장' }).parentElement!;
    const form = submitRow.closest('form')!;
    placeFormTop(form, -1500);
    fireEvent.submit(form);
    await within(submitRow).findByRole('alert');

    // 제출마다 다시 잰다 — 이번에는 맨 위로 돌아와 있다.
    placeFormTop(form, 80);
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getAllByText('저장 거절')).toHaveLength(2));
    const titleInput = screen.getByPlaceholderText('모집 공고 제목을 입력하세요');
    expect(screen.getByRole('alert').compareDocumentPosition(titleInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('등록 모드에서도 스크롤한 상태에서 낸 제출이 거절되면 하단 문구 하나가 알림이다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('이미 진행 중인 모집이 있습니다.'));
    render(<RecruitmentForm mode="create" submitLabel="공개하기" onSubmit={onSubmit} isPending={false} />);
    // 하단 줄과 폼은 확인 창을 열기 전에 잡아 둔다(창이 열려 있는 동안 폼은 aria-hidden 아래다).
    const submitRow = screen.getByRole('button', { name: '공개하기' }).parentElement!;
    placeFormTop(submitRow.closest('form')!, -1500);
    await fillAndPublishCreateForm();

    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.parentElement).toBe(submitRow);
    expect(screen.getAllByText('이미 진행 중인 모집이 있습니다.')).toHaveLength(1);
  });

  it('하단 버튼으로 낸 제출이 거절되면 폼 맨 위가 보여도 위쪽 카드 없이 하단 문구가 알림이 된다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('저장 거절'));
    render(<RecruitmentForm mode="edit" initialValues={editSeed} submitLabel="수정 저장" onSubmit={onSubmit} isPending={false} />);
    const submitButton = screen.getByRole('button', { name: '수정 저장' });
    fireEvent.click(submitButton);

    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    // 하단 버튼을 누른 사용자는 하단 줄을 보고 있다 — 짧은 폼에서는 위쪽 카드가 그 줄을 화면 밖으로 밀어낸다.
    expect(alerts[0]!.parentElement).toBe(submitButton.parentElement);
    expect(screen.getAllByText('저장 거절')).toHaveLength(1);
  });

  it('하단 버튼으로 거절된 뒤 버튼 없이 다시 제출해 거절되면 위쪽 카드가 뜬다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('저장 거절'));
    render(<RecruitmentForm mode="edit" initialValues={editSeed} submitLabel="수정 저장" onSubmit={onSubmit} isPending={false} />);
    const submitButton = screen.getByRole('button', { name: '수정 저장' });
    fireEvent.click(submitButton);
    await within(submitButton.parentElement!).findByRole('alert');

    // 제출마다 다시 정한다 — 폼 밖 버튼(위쪽 버튼)이나 Enter 로 낸 제출은 폼 안의 버튼이 submitter 가 아니다.
    fireEvent.submit(submitButton.closest('form')!);
    await waitFor(() => expect(screen.getAllByText('저장 거절')).toHaveLength(2));
    const titleInput = screen.getByPlaceholderText('모집 공고 제목을 입력하세요');
    expect(screen.getByRole('alert').compareDocumentPosition(titleInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});
