import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { MyFee } from '@duing/types';

import { MyFeeSummary } from '@/app/me/_components/MyFeeSummary';

// D-day 계산 기준을 고정해 결정적으로 검증한다.
const TODAY = new Date('2026-08-10T00:00:00');

const buildFee = (over: Partial<MyFee> = {}): MyFee => ({
  id: 1,
  clubId: 1,
  feePolicyId: 1,
  amount: 10000,
  billingPeriod: '2026-07',
  billingStartDate: '2026-07-01',
  billingEndDate: '2026-07-31',
  dueDate: '2026-07-31',
  status: 'PENDING',
  paidAmount: 0,
  remainingAmount: 10000,
  ...over,
});

describe('MyFeeSummary', () => {
  it('미납이 없으면(완납·취소만) 모두 납부 완료 상태를 보여준다', () => {
    render(
      <MyFeeSummary
        today={TODAY}
        fees={[
          buildFee({ id: 1, status: 'PAID', paidAmount: 10000, remainingAmount: 0 }),
          buildFee({ id: 2, status: 'CANCELLED', remainingAmount: 10000 }),
        ]}
      />,
    );
    expect(screen.getByText(/미납 회비가 없어요/)).toBeInTheDocument();
    expect(screen.queryByText('미납 회비')).not.toBeInTheDocument();
  });

  it('미납 잔액 합계는 PARTIAL_PAID 의 remainingAmount 만 더하고 취소·완납은 제외한다', () => {
    render(
      <MyFeeSummary
        today={TODAY}
        fees={[
          buildFee({ id: 1, status: 'PENDING', amount: 10000, remainingAmount: 10000 }),
          buildFee({ id: 2, status: 'PARTIAL_PAID', amount: 50000, paidAmount: 20000, remainingAmount: 30000 }),
          buildFee({ id: 3, status: 'PAID', amount: 10000, paidAmount: 10000, remainingAmount: 0 }),
          buildFee({ id: 4, status: 'CANCELLED', amount: 99000, remainingAmount: 99000 }),
        ]}
      />,
    );
    // 10,000 + 30,000 = 40,000 (완납 0, 취소 99,000 제외)
    expect(screen.getByText('40,000원')).toBeInTheDocument();
    expect(screen.getByText(/미납 2건/)).toBeInTheDocument();
  });

  it('연체가 없으면 가장 이른 마감일을 "다음 마감"으로 D-day 와 함께 안내한다', () => {
    render(
      <MyFeeSummary
        today={TODAY}
        fees={[
          buildFee({ id: 1, status: 'PENDING', dueDate: '2026-09-30', remainingAmount: 10000 }),
          buildFee({ id: 2, status: 'PARTIAL_PAID', dueDate: '2026-08-15', remainingAmount: 5000 }),
        ]}
      />,
    );
    // 2026-08-10 기준 2026-08-15 = D-5
    expect(screen.getByText(/다음 마감 2026-08-15 \(D-5\)/)).toBeInTheDocument();
    expect(screen.queryByText(/연체/)).not.toBeInTheDocument();
  });

  it('연체가 있으면 "연체 N건"을 메인으로 강조하고 다음 마감은 표시하지 않는다', () => {
    render(
      <MyFeeSummary
        today={TODAY}
        fees={[
          buildFee({ id: 1, status: 'OVERDUE', dueDate: '2026-05-31', remainingAmount: 10000 }),
          buildFee({ id: 2, status: 'OVERDUE', dueDate: '2026-06-30', remainingAmount: 20000 }),
          buildFee({ id: 3, status: 'PENDING', dueDate: '2026-09-30', remainingAmount: 5000 }),
        ]}
      />,
    );
    expect(screen.getByText('35,000원')).toBeInTheDocument();
    expect(screen.getByText('연체 2건')).toBeInTheDocument();
    expect(screen.queryByText(/다음 마감/)).not.toBeInTheDocument();
  });
});
