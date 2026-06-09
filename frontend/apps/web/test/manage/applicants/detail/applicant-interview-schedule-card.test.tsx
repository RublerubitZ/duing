import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AvailabilityItem } from '@duing/types';

import { ApplicantInterviewScheduleCard } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantInterviewScheduleCard';

const slotA: AvailabilityItem = {
  slotId: 1,
  startTime: '2026-06-13T18:00:00',
  endTime: '2026-06-13T18:30:00',
};
const slotB: AvailabilityItem = {
  slotId: 2,
  startTime: '2026-06-13T18:30:00',
  endTime: '2026-06-13T19:00:00',
};
const slotC: AvailabilityItem = {
  slotId: 3,
  startTime: '2026-06-14T19:00:00',
  endTime: '2026-06-14T19:30:00',
};

describe('ApplicantInterviewScheduleCard', () => {
  it('빈 availability + 미배정 → "미배정" 과 "아직 선택하지 않았습니다" 안내가 노출된다', () => {
    render(
      <ApplicantInterviewScheduleCard
        interviewAvailabilities={[]}
        assignedSlot={null}
        onOpenManualAssign={() => {}}
      />,
    );

    expect(screen.getByText('미배정')).toBeInTheDocument();
    expect(screen.getByText('아직 선택하지 않았습니다')).toBeInTheDocument();
  });

  it('배정 슬롯이 availability 안에 포함되면 해당 row 에 "현재 배정" 배지가 표시된다', () => {
    render(
      <ApplicantInterviewScheduleCard
        interviewAvailabilities={[slotA, slotB]}
        assignedSlot={slotA}
        onOpenManualAssign={() => {}}
      />,
    );

    const list = screen.getByRole('list', { name: '지원자가 선택한 면접 가능 시간' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);

    const assignedRow = items.find((row) => row.textContent?.startsWith('6/13 (토) 18:00'));
    expect(assignedRow).toBeDefined();
    expect(assignedRow).toHaveTextContent('현재 배정');

    const otherRow = items.find((row) => row.textContent?.startsWith('6/13 (토) 18:30'));
    expect(otherRow).toBeDefined();
    expect(otherRow).not.toHaveTextContent('현재 배정');
  });

  it('배정 슬롯이 availability 밖(Override) 이면 "현재 배정" 섹션에만 라벨이 보이고 리스트 row 에는 배지가 없다', () => {
    render(
      <ApplicantInterviewScheduleCard
        interviewAvailabilities={[slotA, slotB]}
        assignedSlot={slotC}
        onOpenManualAssign={() => {}}
      />,
    );

    expect(screen.getByText(/6\/14.*19:00.*–.*19:30/)).toBeInTheDocument();

    const list = screen.getByRole('list', { name: '지원자가 선택한 면접 가능 시간' });
    const items = within(list).getAllByRole('listitem');
    expect(items.every((row) => !row.textContent?.includes('현재 배정'))).toBe(true);
  });

  it('"수동 배정 변경" 버튼 클릭 시 onOpenManualAssign 콜백을 호출한다', async () => {
    const onOpen = vi.fn();
    render(
      <ApplicantInterviewScheduleCard
        interviewAvailabilities={[slotA]}
        assignedSlot={slotA}
        onOpenManualAssign={onOpen}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '수동 배정 변경' }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('availability 라벨이 wall-clock 그대로(M/D HH:mm) 표시된다 — UTC 변환 금지', () => {
    render(
      <ApplicantInterviewScheduleCard
        interviewAvailabilities={[slotA]}
        assignedSlot={null}
        onOpenManualAssign={() => {}}
      />,
    );

    expect(screen.getByText(/6\/13.*18:00.*–.*18:30/)).toBeInTheDocument();
  });
});
