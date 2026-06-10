import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InterviewSlotLifecyclePhase, ManagementSlotView } from '@duing/types';
import { ManagementSlotCard } from '@/components/interview/ManagementSlotCard';

// Slot Lifecycle 정책 (spec 2026-06-10) — phase × availabilityCount 매트릭스 검증.
// 카드 자체에는 시간/정원 인라인 편집 UI 가 없으므로 본 테스트는 다음을 검증한다:
//   - 삭제 버튼 활성/비활성 + 안내 메시지
//   - "지원자 N명 선택" 배지
//   - phase 3 에서는 모든 mutation 액션 잠금

const baseSlot: ManagementSlotView = {
  slotId: 7,
  startTime: '2026-06-18T18:00:00',
  endTime: '2026-06-18T18:30:00',
  capacity: 2,
  availabilityCount: 0,
  assignedCount: 0,
};

function renderCard({
  slot = baseSlot,
  slotLifecyclePhase = 'BEFORE_DEADLINE' as InterviewSlotLifecyclePhase,
  onDeleteSlot = () => {},
}: {
  slot?: ManagementSlotView;
  slotLifecyclePhase?: InterviewSlotLifecyclePhase;
  onDeleteSlot?: (slotId: number) => void;
} = {}) {
  return render(
    <ManagementSlotCard
      slot={slot}
      slotLifecyclePhase={slotLifecyclePhase}
      onDeleteSlot={onDeleteSlot}
    />,
  );
}

describe('ManagementSlotCard — phase × availabilityCount 매트릭스', () => {
  it('phase 1 + 빈 슬롯: 삭제 버튼이 활성이고 선택 배지가 노출되지 않는다', async () => {
    const user = userEvent.setup();
    const onDeleteSlot = vi.fn();
    renderCard({
      slot: { ...baseSlot, availabilityCount: 0 },
      slotLifecyclePhase: 'BEFORE_DEADLINE',
      onDeleteSlot,
    });

    const deleteButton = screen.getByRole('button', { name: '슬롯 삭제' });
    expect(deleteButton).toBeEnabled();
    expect(screen.queryByText(/지원자 .*명 선택/)).not.toBeInTheDocument();

    await user.click(deleteButton);
    expect(onDeleteSlot).toHaveBeenCalledWith(7);
  });

  it('phase 1 + 선택 슬롯(availabilityCount > 0): 삭제 비활성 + "지원자 N명 선택" 배지', () => {
    renderCard({
      slot: { ...baseSlot, availabilityCount: 3 },
      slotLifecyclePhase: 'BEFORE_DEADLINE',
    });

    expect(screen.getByText('지원자 3명 선택')).toBeInTheDocument();
    const deleteButton = screen.getByRole('button', { name: '슬롯 삭제' });
    expect(deleteButton).toBeDisabled();
    expect(
      screen.getByText(/지원자 3명이 선택한 슬롯입니다\. 삭제할 수 없습니다\./),
    ).toBeInTheDocument();
  });

  it('phase 2 + 빈 슬롯: 삭제 활성', () => {
    renderCard({
      slot: { ...baseSlot, availabilityCount: 0 },
      slotLifecyclePhase: 'AFTER_DEADLINE_BEFORE_ASSIGNMENT',
    });

    expect(screen.getByRole('button', { name: '슬롯 삭제' })).toBeEnabled();
    expect(screen.queryByText(/지원자 .*명 선택/)).not.toBeInTheDocument();
  });

  it('phase 2 + 선택 슬롯: 삭제 비활성 + 선택 배지', () => {
    renderCard({
      slot: { ...baseSlot, availabilityCount: 2 },
      slotLifecyclePhase: 'AFTER_DEADLINE_BEFORE_ASSIGNMENT',
    });

    expect(screen.getByText('지원자 2명 선택')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '슬롯 삭제' })).toBeDisabled();
  });

  it('phase 3 + 빈 슬롯: 삭제 비활성 + 자동배정 완료 안내', () => {
    renderCard({
      slot: { ...baseSlot, availabilityCount: 0 },
      slotLifecyclePhase: 'AFTER_ASSIGNMENT',
    });

    const deleteButton = screen.getByRole('button', { name: '슬롯 삭제' });
    expect(deleteButton).toBeDisabled();
    expect(
      screen.getByText(/자동배정이 완료되어 슬롯을 삭제할 수 없습니다\./),
    ).toBeInTheDocument();
  });

  it('phase 3 + 선택 슬롯: 삭제 비활성', () => {
    renderCard({
      slot: { ...baseSlot, availabilityCount: 4 },
      slotLifecyclePhase: 'AFTER_ASSIGNMENT',
    });

    expect(screen.getByText('지원자 4명 선택')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '슬롯 삭제' })).toBeDisabled();
  });

  it('onDeleteSlot 미전달 시 삭제 버튼이 렌더되지 않는다 (ScheduleManagementSection 사용 경로)', () => {
    render(
      <ManagementSlotCard
        slot={baseSlot}
        slotLifecyclePhase="AFTER_ASSIGNMENT"
      />,
    );

    expect(screen.queryByRole('button', { name: '슬롯 삭제' })).not.toBeInTheDocument();
  });
});
