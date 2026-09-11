import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecruitmentForm } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';
import { saveRecruitmentDraft } from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentDraft';

describe('RecruitmentForm 오류 표시', () => {
  beforeEach(() => window.localStorage.clear());

  it('빈 폼을 제출하면 요약 카드와 필드별 오류가 뜨고 onSubmit 은 호출되지 않는다', async () => {
    const onSubmit = vi.fn();
    render(<RecruitmentForm mode="create" submitLabel="공개하기" onSubmit={onSubmit} isPending={false} />);
    fireEvent.submit(screen.getByRole('button', { name: '공개하기' }).closest('form')!);
    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent(/곳을 확인해 주세요/);
    // 같은 문구가 요약 카드와 제목 입력 아래에 한 번씩 — 요약에서 눌러 필드로 이동하는 쌍이다.
    expect(screen.getAllByText('제목은 필수 입력값입니다.')).toHaveLength(2);
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
});
