import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { StatsSummary } from '@duing/types';

import { CloseRecruitmentConfirmDescription } from '@/app/manage/clubs/[clubId]/recruitments/_components/CloseRecruitmentConfirmDescription';

// 마감(CLOSED)은 지원현황 조회 전용 전환(#875)이라 되돌릴 수 없다 — 다이얼로그가 그 결과와
// 미결 지원서 수를 사전에 알리는지 고정한다. "접수만 마감"으로 오해한 채 심사를 잠그는 사고 방지용.

function summary(overrides: Partial<StatsSummary>): StatsSummary {
  return {
    total: 0,
    submitted: 0,
    onHold: 0,
    interviewPending: 0,
    accepted: 0,
    rejected: 0,
    capacity: 10,
    ratio: 0,
    ...overrides,
  };
}

describe('CloseRecruitmentConfirmDescription', () => {
  it('자체 폼에 미결 지원서(지원 완료+보류+면접 대상)가 있으면 건수와 마감 후 처리 범위를 알린다', () => {
    render(
      <CloseRecruitmentConfirmDescription
        applicationMode="SELF"
        statsSummary={summary({ total: 6, submitted: 2, onHold: 1, interviewPending: 1, accepted: 2 })}
      />,
    );

    expect(screen.getByText('4건')).toBeInTheDocument();
    // 결과를 영영 못 낸다고 겁주지 않는다 — 마감 후에도 합격·불합격 확정은 가능하다.
    expect(screen.getByText(/합격·불합격 확정만 할 수 있습니다/)).toBeInTheDocument();
    expect(screen.getByText(/평가·면접 진행도 멈춥니다/)).toBeInTheDocument();
  });

  it('미결이 0건이면 건수 안내 없이 마감 효과만 보여준다', () => {
    render(
      <CloseRecruitmentConfirmDescription
        applicationMode="SELF"
        statsSummary={summary({ total: 3, accepted: 2, rejected: 1 })}
      />,
    );

    expect(screen.getByText(/평가·면접 진행도 멈춥니다/)).toBeInTheDocument();
    expect(screen.queryByText(/아직 결과가 정해지지 않은/)).toBeNull();
  });

  it('요약을 아직 못 받았으면 수치를 지어내지 않고 일반 안내만 보여준다', () => {
    render(<CloseRecruitmentConfirmDescription applicationMode="SELF" statsSummary={undefined} />);

    expect(screen.getByText(/평가·면접 진행도 멈춥니다/)).toBeInTheDocument();
    expect(screen.queryByText(/아직 결과가 정해지지 않은/)).toBeNull();
  });

  it('외부 폼은 지원현황 대신 가입 링크 발급 중단을 알린다', () => {
    render(<CloseRecruitmentConfirmDescription applicationMode="EXTERNAL" statsSummary={undefined} />);

    expect(screen.getByText(/새 가입 링크를 만들 수 없고/)).toBeInTheDocument();
    expect(screen.queryByText(/평가·면접 진행도 멈춥니다/)).toBeNull();
  });

  // 링크 기한은 마감 시각과 종료일 다음 날 0시 중 이른 쪽부터 센다 — 0일 링크는 진행 중 마감이면 그 순간, 종료일이 지난
  // 모집이면 마감 전에 이미 만료돼 있다. 이 창은 둘을 가리지 못하므로 둘 다 참인 문장만 쓴다("바로 만료"는 뒤쪽에서 거짓).
  it("외부 폼은 '모집 종료일까지' 가입 링크를 마감 뒤에는 쓸 수 없다고 알린다", () => {
    render(
      <CloseRecruitmentConfirmDescription applicationMode="EXTERNAL" statsSummary={undefined} />,
    );

    expect(
      screen.getByText(/'모집 종료일까지'로 만든 링크는 마감 뒤에는 쓸 수 없습니다\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/바로 만료/)).toBeNull();
  });
});
