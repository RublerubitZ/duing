import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecruitmentForm } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';
import {
  loadRecruitmentDraft,
  saveRecruitmentDraft,
} from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentDraft';

describe('RecruitmentForm 오류 표시', () => {
  beforeEach(() => window.localStorage.clear());

  it('빈 폼을 제출하면 요약 카드와 필드별 오류가 뜨고 onSubmit 은 호출되지 않는다', async () => {
    const onSubmit = vi.fn();
    render(<RecruitmentForm mode="create" submitLabel="공개하기" onSubmit={onSubmit} isPending={false} />);
    fireEvent.submit(screen.getByRole('button', { name: '공개하기' }).closest('form')!);
    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent(/곳을 확인해 주세요/);
    expect(screen.getByText('제목은 필수 입력값입니다.')).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText(/^시작일/), { target: { value: '2026-09-20' } });
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
});
