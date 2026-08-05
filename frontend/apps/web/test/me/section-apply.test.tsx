import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationSummary } from '@duing/types';

import { SectionApply } from '../../app/me/_components/SectionApply';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const base: ApplicationSummary = {
  id: 1,
  recruitmentId: 100,
  recruitmentTitle: '봄 신입 모집',
  recruitmentStatus: 'OPEN',
  clubId: 10,
  clubName: '두잉 댄스',
  category: 'CREATION',
  logoUrl: null,
  status: 'SUBMITTED',
  interview: null,
  submittedAt: '2026-05-26T10:00:00Z',
};

describe('SectionApply — active 상태만 렌더', () => {
  it('SUBMITTED 카드는 정상 렌더된다', () => {
    render(<SectionApply applications={[base]} />);
    expect(screen.getByText('두잉 댄스')).toBeInTheDocument();
  });

  // 어떤 항목이든 조용히 버리지 않는다 — 헤더는 배열 길이를 그대로 세므로 렌더에서 걸러내면
  // "카운트 N, 목록 N-1" 인 유령 항목이 된다. 진행 중/지난 지원 분류는 호출부가 책임진다.
  it('종결 상태가 섞여 들어와도 버리지 않아 카운트와 목록이 어긋나지 않는다', () => {
    const accepted = { ...base, id: 2, status: 'ACCEPTED' as const, clubName: '합격동아리' };
    render(<SectionApply applications={[base, accepted]} />);
    expect(screen.getByText('두잉 댄스')).toBeInTheDocument();
    expect(screen.getByText('합격동아리')).toBeInTheDocument();
    expect(screen.getByText(/진행 중인 지원 · 2/)).toBeInTheDocument();
  });

  it('SUBMITTED 와 ON_HOLD 는 지원자에게 동일하게 심사 중으로 보인다', () => {
    const submitted = render(<SectionApply applications={[base]} />);
    const submittedCard = submitted.container.querySelector('[data-section="apply"]');
    const submittedText = submittedCard?.textContent ?? '';
    submitted.unmount();

    const onHold = render(
      <SectionApply applications={[{ ...base, status: 'ON_HOLD' }]} />,
    );
    const onHoldText =
      onHold.container.querySelector('[data-section="apply"]')?.textContent ?? '';

    expect(onHoldText).toBe(submittedText);
    expect(onHoldText).toContain('동아리에서 심사 중입니다');
    // 서류검토 단계는 제거됐다 (스펙 §5-5).
    expect(onHoldText).not.toContain('검토');
  });

  it('빈 배열이면 안내 문구가 노출된다', () => {
    render(<SectionApply applications={[]} />);
    expect(screen.getByText(/진행 중인 지원이 없어요/)).toBeInTheDocument();
  });

  it('INTERVIEW_PENDING + interview.location 이 string 이면 statusNote 에 시각과 장소가 함께 표시된다', () => {
    const interviewPending: ApplicationSummary = {
      ...base,
      id: 11,
      status: 'INTERVIEW_PENDING',
      interview: {
        startAt: '2026-06-20T18:00:00',
        endAt: '2026-06-20T18:30:00',
        location: '본관 201호',
      },
    };
    render(<SectionApply applications={[interviewPending]} />);
    // statusNote 텍스트: `면접: {at} — 본관 201호` — 시각/장소 구분자 "—" 와 장소가 노출된다.
    expect(screen.getByText(/면접: .+ — 본관 201호/)).toBeInTheDocument();
  });

  it('INTERVIEW_PENDING + interview.location 이 null 이면 statusNote 에 시각만 표시되고 " — {location}" segment 는 렌더되지 않는다 (BE config.location 미설정 회귀 가드)', () => {
    const interviewPendingNoLocation: ApplicationSummary = {
      ...base,
      id: 12,
      status: 'INTERVIEW_PENDING',
      interview: {
        startAt: '2026-06-20T18:00:00',
        endAt: '2026-06-20T18:30:00',
        location: null,
      },
    };
    render(<SectionApply applications={[interviewPendingNoLocation]} />);
    // 카드 내에 "—" 구분자가 어디에도 나오면 안 된다 (location segment 가 통째로 생략).
    expect(screen.queryByText(/—/)).not.toBeInTheDocument();
    // statusNote 와 step progress 둘 다 "면접: ..." prefix 로 시작하는 텍스트를 노출하므로
    // getAllByText 로 둘 다 매칭되는지 확인하고, 어떤 노드에도 장소 segment 가 없는지 검증한다.
    const interviewTexts = screen.getAllByText(/^면접: /);
    expect(interviewTexts.length).toBeGreaterThanOrEqual(1);
    for (const node of interviewTexts) {
      expect(node.textContent ?? '').not.toMatch(/—/);
    }
  });
});
