import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecruitmentForm } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';
import {
  loadRecruitmentDraft,
  saveRecruitmentDraft,
} from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentDraft';

// 이탈 가드(#1189)가 붙으면 RecruitmentForm 이 useRouter 컨텍스트를 요구한다 — 단독 렌더라 스텁한다
// (recruitment-form.test.tsx 와 같은 스텁, 병합 순서와 무관하게 통과하도록 선반영).
vi.mock('@/app/_lib/useGuardedRouter', () => ({
  useGuardedRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

/** 절대 미래 날짜는 언젠가 과거가 되는 시한폭탄이라 오늘 기준으로 만든다(en-CA = YYYY-MM-DD). */
function localIsoDate(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toLocaleDateString('en-CA');
}

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
    fireEvent.change(screen.getByLabelText(/^시작일/), { target: { value: localIsoDate(0) } });
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
    saveRecruitmentDraft(7, { title: '이어쓰기 제목', capacity: 3 });
    render(<RecruitmentForm mode="create" draftClubId={7} submitLabel="공개하기" onSubmit={vi.fn()} isPending={false} />);
    fireEvent.click(await screen.findByRole('button', { name: '이어서 쓰기' }));
    expect(screen.getByPlaceholderText('모집 공고 제목을 입력하세요')).toHaveValue('이어쓰기 제목');
  });

  it('입력을 멈추면 1.5초 뒤 임시저장된다', () => {
    vi.useFakeTimers();
    try {
      render(
        <RecruitmentForm mode="create" draftClubId={7} submitLabel="공개하기" onSubmit={vi.fn()} isPending={false} />,
      );
      fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), {
        target: { value: '자동 저장 제목' },
      });
      // debounce 전에는 아직 아무것도 쓰지 않는다.
      expect(loadRecruitmentDraft(7)).toBeNull();

      act(() => vi.advanceTimersByTime(1500));

      expect(loadRecruitmentDraft(7)?.values.title).toBe('자동 저장 제목');
    } finally {
      vi.useRealTimers();
    }
  });

  // 배너를 무시하고 계속 쓰는 쪽이 더 흔하다 — 그 입력을 통째로 잃느니 옛 저장본을 덮는다.
  it('배너를 무시하고 입력하면 배너가 사라지고 자동 저장이 다시 돌아간다', () => {
    vi.useFakeTimers();
    try {
      saveRecruitmentDraft(7, { title: '옛 저장본' });
      render(
        <RecruitmentForm mode="create" draftClubId={7} submitLabel="공개하기" onSubmit={vi.fn()} isPending={false} />,
      );
      expect(screen.getByRole('button', { name: '이어서 쓰기' })).toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), {
        target: { value: '배너 무시하고 쓴 제목' },
      });

      expect(screen.queryByRole('button', { name: '이어서 쓰기' })).not.toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1500));

      expect(loadRecruitmentDraft(7)?.values.title).toBe('배너 무시하고 쓴 제목');
    } finally {
      vi.useRealTimers();
    }
  });

  // 배너를 무시하고 한 글자 쳤다가 debounce 안에 지우면 이 세션은 아직 아무것도 저장하지 않았다.
  // 그 상태에서 옛 저장본까지 지우면 배너도 이미 접힌 뒤라 되살릴 길이 없다.
  it('이 세션에서 저장한 적 없는 초안은 되돌림으로 지워지지 않는다', () => {
    vi.useFakeTimers();
    try {
      saveRecruitmentDraft(7, { title: '옛 저장본', capacity: 5 });
      render(
        <RecruitmentForm mode="create" draftClubId={7} submitLabel="공개하기" onSubmit={vi.fn()} isPending={false} />,
      );
      const titleInput = screen.getByPlaceholderText('모집 공고 제목을 입력하세요');
      fireEvent.change(titleInput, { target: { value: 'a' } });
      // 1.5초가 지나기 전에 되돌린다 — 저장은 한 번도 일어나지 않았다.
      fireEvent.change(titleInput, { target: { value: '' } });

      act(() => vi.advanceTimersByTime(1500));

      expect(loadRecruitmentDraft(7)?.values.title).toBe('옛 저장본');
      expect(loadRecruitmentDraft(7)?.values.capacity).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  // 자동 저장의 "초기값으로 돌아왔으면 지운다" 기준선은 마운트 시 시드값이어야 한다. 복원값이 기준선이
  // 되면 복원 후 한 글자 쳤다 지우는 것만으로 저장본이 사라져 새로고침 시 복원할 내용이 없어진다.
  it('이어서 쓰기로 복원한 값은 편집을 되돌려도 지워지지 않는다', () => {
    vi.useFakeTimers();
    try {
      saveRecruitmentDraft(7, { title: '복원할 제목' });
      render(
        <RecruitmentForm mode="create" draftClubId={7} submitLabel="공개하기" onSubmit={vi.fn()} isPending={false} />,
      );
      fireEvent.click(screen.getByRole('button', { name: '이어서 쓰기' }));

      const titleInput = screen.getByPlaceholderText('모집 공고 제목을 입력하세요');
      fireEvent.change(titleInput, { target: { value: '복원할 제목!' } });
      fireEvent.change(titleInput, { target: { value: '복원할 제목' } });

      act(() => vi.advanceTimersByTime(1500));

      expect(loadRecruitmentDraft(7)).not.toBeNull();
      expect(loadRecruitmentDraft(7)?.values.title).toBe('복원할 제목');
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
    const startDate = localIsoDate(5);
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

  // 시트에 설명이 없으면 Radix 가 콘솔 경고를 내고, 스크린리더는 무엇이 열렸는지 알 수 없다.
  it('미리보기 시트에 스크린리더용 설명이 붙는다', async () => {
    render(<RecruitmentForm mode="create" submitLabel="공개하기" onSubmit={vi.fn()} isPending={false} />);
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));

    expect(await screen.findByRole('dialog')).toHaveAccessibleDescription(
      '작성 중인 모집을 지원자 시점으로 미리 봅니다.',
    );
  });
});
