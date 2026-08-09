import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApplicantTable } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantTable';
import type { Applicant } from '@duing/types';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}));

const baseApplicant: Applicant = {
  applicationId: 1,
  userId: 1,
  userName: '홍길동',
  studentId: '20200001',
  college: 'IT_ENGINEERING',
  major: '컴퓨터공학과',
  grade: 'JUNIOR',
  answers: [],
  status: 'SUBMITTED',
  submittedAt: '2026-05-01T10:00:00',
  interviewStartAt: null,
  myScore: null,
};

const secondApplicant: Applicant = {
  ...baseApplicant,
  applicationId: 2,
  userId: 2,
  userName: '김두잉',
  studentId: '20200002',
};

/**
 * 모바일 카드의 체크박스는 44px 라벨로 감싸져 있다 — 표(데스크탑) 체크박스에는 라벨이 없다.
 * 표 쪽도 라벨로 감싸지는 날에는 여기서 2개가 잡혀 바로 터진다(조용히 엉뚱한 요소를 검증하지 않도록).
 */
function mobileCheckbox(userName: string): HTMLInputElement {
  const wrapped = screen
    .getAllByRole('checkbox', { name: `${userName} 선택` })
    .filter((candidate) => candidate.closest('label') !== null);
  if (wrapped.length !== 1) {
    throw new Error(`모바일 카드 체크박스를 특정하지 못했습니다(${wrapped.length}개): ${userName}`);
  }
  const [checkbox] = wrapped;
  if (!(checkbox instanceof HTMLInputElement)) throw new Error('체크박스가 input 이 아닙니다');
  return checkbox;
}

/** 체크박스를 감싼 44px 히트 영역(label). */
function mobileHitArea(userName: string): HTMLLabelElement {
  const label = mobileCheckbox(userName).closest('label');
  if (!label) throw new Error(`히트 영역을 찾지 못했습니다: ${userName}`);
  return label;
}

/** 히트 영역 바깥의 카드 본문(이름 줄). */
function mobileCardBody(userName: string): HTMLElement {
  const body = mobileHitArea(userName).nextElementSibling;
  if (!(body instanceof HTMLElement)) throw new Error(`카드 본문을 찾지 못했습니다: ${userName}`);
  return body;
}

function renderTable(overrides: {
  applicants?: Applicant[];
  selectedIds?: number[];
  onSelect?: (next: number[]) => void;
}) {
  const applicants = overrides.applicants ?? [baseApplicant];
  const selectedIds = overrides.selectedIds ?? [];
  return render(
    <ApplicantTable
      applicants={applicants}
      selectedIds={selectedIds}
      selectedSet={new Set(selectedIds)}
      onSelect={overrides.onSelect ?? (() => {})}
      useInterview={false}
      clubId={1}
      recruitmentId={1}
    />,
  );
}

describe('모바일 지원자 카드 — 선택 영역과 상세 이동 분리', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  /*
   * jsdom 에는 레이아웃이 없어 44px 을 실측할 수 없다. 히트 영역을 좁히면(=체크박스 크기로 되돌리면)
   * 행동 테스트는 전부 통과해버려 이 PR 이 고친 문제가 조용히 되살아나므로, 크기 의도만 클래스로 못박는다.
   * 실제 픽셀 검증은 브라우저 QA 로 한다.
   */
  it('히트 영역은 44px(h-11 w-11)이고 카드 padding 만큼 바깥으로 확장된다', () => {
    renderTable({});

    expect(mobileHitArea('홍길동')).toHaveClass('h-11', 'w-11', '-my-3', '-ml-3');
  });

  it('체크박스를 누르면 선택만 되고 상세로 이동하지 않는다', () => {
    const onSelect = vi.fn();
    renderTable({ onSelect });

    fireEvent.click(mobileCheckbox('홍길동'));

    expect(onSelect).toHaveBeenCalledWith([1]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('체크박스 주변 히트 영역을 눌러도 선택만 되고 상세로 이동하지 않는다', () => {
    const onSelect = vi.fn();
    renderTable({ onSelect });

    fireEvent.click(mobileHitArea('홍길동'));

    // 라벨 클릭은 input 으로 포워딩되며 click 이 2회 흐르지만 토글은 1회여야 한다.
    expect(onSelect).toHaveBeenCalledWith([1]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('선택된 상태에서 히트 영역을 누르면 선택이 해제된다', () => {
    const onSelect = vi.fn();
    renderTable({ onSelect, selectedIds: [1] });

    fireEvent.click(mobileHitArea('홍길동'));

    expect(onSelect).toHaveBeenCalledWith([]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('카드 본문을 누르면 기존대로 상세로 이동한다', () => {
    const onSelect = vi.fn();
    renderTable({ onSelect });

    fireEvent.click(mobileCardBody('홍길동'));

    expect(pushMock).toHaveBeenCalledWith(
      '/manage/clubs/1/recruitments/1/applicants/1',
    );
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('여러 지원자를 연속으로 선택해도 이동 없이 누적된다', () => {
    const onSelect = vi.fn();
    const { rerender } = renderTable({
      applicants: [baseApplicant, secondApplicant],
      onSelect,
    });

    fireEvent.click(mobileHitArea('홍길동'));
    expect(onSelect).toHaveBeenLastCalledWith([1]);

    rerender(
      <ApplicantTable
        applicants={[baseApplicant, secondApplicant]}
        selectedIds={[1]}
        selectedSet={new Set([1])}
        onSelect={onSelect}
        useInterview={false}
        clubId={1}
        recruitmentId={1}
      />,
    );
    fireEvent.click(mobileHitArea('김두잉'));

    expect(onSelect).toHaveBeenLastCalledWith([1, 2]);
    expect(pushMock).not.toHaveBeenCalled();
  });

  /*
   * 의도된 정책: 선택 영역은 카드 상태와 무관하게 항상 선택 영역이다. 최종 상태라 선택이 막힌
   * 카드에서 이 영역이 상세 이동으로 새어버리면, 다중 선택 도중 손가락이 스치는 순간 화면이
   * 튀고 선택이 통째로 날아간다 — 이 PR 이 없애려는 바로 그 사고다. 데스크탑 표도 동일 규칙.
   */
  it('최종 상태(ACCEPTED) 카드의 히트 영역은 선택도 이동도 하지 않는다', () => {
    const onSelect = vi.fn();
    renderTable({ applicants: [{ ...baseApplicant, status: 'ACCEPTED' }], onSelect });

    fireEvent.click(mobileHitArea('홍길동'));

    expect(onSelect).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('최종 상태 카드도 본문을 누르면 상세로 이동한다', () => {
    renderTable({ applicants: [{ ...baseApplicant, status: 'ACCEPTED' }] });

    fireEvent.click(mobileCardBody('홍길동'));

    expect(pushMock).toHaveBeenCalledTimes(1);
  });
});
