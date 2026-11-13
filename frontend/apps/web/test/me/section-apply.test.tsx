import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationSummary, AssignedInterview } from '@duing/types';

import { SectionApply } from '../../app/me/_components/SectionApply';

vi.mock('next/link', () => ({
  default: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => (
    <a href={href} className={className}>{children}</a>
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

// 카드는 확정 면접이 끝났는지를 지금 시각으로 가른다 — 픽스처 면접일(6/20·11/20)보다 앞선 시각에 묶어 날짜가 지나도 깨지지 않게 한다.
// 이보다 이른 면접일로 '다가옴'을 단언하려면 그 테스트에서 setSystemTime 을 다시 맞춘다.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-01T09:00:00+09:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

// 카드 뿌리는 'relative' 클래스를 가진 div 다(다음 일정 배지를 겹쳐 올리는 기준).
const cardOf = (clubName: string): HTMLElement => {
  const card = screen.getByText(clubName).closest<HTMLElement>('.relative');
  if (!card) throw new Error(`카드를 찾지 못함: ${clubName}`);
  return card;
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

describe('SectionApply — 진행 상태 마디는 면접을 쓰는 모집에만 면접 마디를 둔다', () => {
  it('면접을 쓰지 않는 모집은 심사·최종 결과이고 심사가 진행 중이다', () => {
    render(<SectionApply applications={[{ ...base, useInterview: false }]} />);
    expect(screen.queryByText('면접')).not.toBeInTheDocument();
    expect(screen.getByText('최종 결과')).toBeInTheDocument();
    expect(screen.getByText('심사')).toHaveClass('font-bold');
  });

  it('운영진이 면접을 끈 모집에 남은 면접 대상도 심사에 머문다', () => {
    render(<SectionApply applications={[{ ...base, status: 'INTERVIEW_PENDING', useInterview: false }]} />);
    expect(screen.getByText('심사')).toHaveClass('font-bold');
    expect(screen.getByText('최종 결과')).not.toHaveClass('font-bold');
  });

  it.each([true, undefined])('useInterview=%s 면 지금처럼 심사·면접이다', (useInterview) => {
    render(<SectionApply applications={[{ ...base, useInterview }]} />);
    expect(screen.getByText('면접')).toBeInTheDocument();
    expect(screen.queryByText('최종 결과')).not.toBeInTheDocument();
  });

  it('면접 사용·미사용 카드가 섞여도 카드마다 자기 모집 값을 따른다', () => {
    render(
      <SectionApply
        applications={[
          { ...base, id: 1, clubName: '면접 없는 동아리', useInterview: false },
          { ...base, id: 2, clubName: '면접 보는 동아리', useInterview: true },
        ]}
      />,
    );
    expect(within(cardOf('면접 없는 동아리')).getByText('최종 결과')).toBeInTheDocument();
    expect(within(cardOf('면접 없는 동아리')).queryByText('면접')).not.toBeInTheDocument();
    expect(within(cardOf('면접 보는 동아리')).getByText('면접')).toBeInTheDocument();
    expect(within(cardOf('면접 보는 동아리')).queryByText('최종 결과')).not.toBeInTheDocument();
  });
});

describe('SectionApply — 면접을 끈 모집에 남은 면접 대상은 면접 일정을 안내하지 않는다', () => {
  const leftover: ApplicationSummary = {
    ...base,
    status: 'INTERVIEW_PENDING',
    interview: { startAt: '2026-11-20T14:00:00', endAt: '2026-11-20T14:30:00', location: '학생회관 302호' },
    useInterview: false,
  };

  it.each([
    ['확정 배정이 남은', leftover],
    ['배정이 없는', { ...leftover, interview: null }],
  ])('%s 카드는 다음 일정·면접 안내 없이 심사 중 카드처럼 보인다', (_case, summary) => {
    render(<SectionApply applications={[summary]} />);
    const card = cardOf('두잉 댄스');
    expect(within(card).queryByText('다음 일정')).not.toBeInTheDocument();
    expect(card.textContent).not.toMatch(/면접:/);
    expect(card.textContent).not.toContain('학생회관 302호');
    expect(within(card).getByText('동아리에서 심사 중입니다')).toBeInTheDocument();
    expect(card).toHaveClass('border-line');
    expect(card).not.toHaveClass('border-ink');
    const link = within(card).getByRole('link');
    expect(link).toHaveTextContent('지원서 보기');
    expect(link).toHaveClass('btn-secondary');
    expect(link).toHaveAttribute('href', '/me/applications/1');
  });

  it.each([true, undefined])('useInterview=%s 면 지금처럼 다음 일정·면접 일정 보기·면접 안내다(fail-open)', (useInterview) => {
    render(<SectionApply applications={[{ ...leftover, useInterview }]} />);
    const card = cardOf('두잉 댄스');
    expect(within(card).getByText('다음 일정')).toBeInTheDocument();
    expect(within(card).getByText(/면접: .+ — 학생회관 302호/)).toBeInTheDocument();
    expect(card).toHaveClass('border-ink');
    const link = within(card).getByRole('link');
    expect(link).toHaveTextContent('면접 일정 보기');
    expect(link).toHaveClass('btn-primary');
  });

  it.each([true, undefined])('useInterview=%s 인 모집의 심사 중 카드에는 면접 표기가 붙지 않는다', (useInterview) => {
    render(<SectionApply applications={[{ ...base, useInterview }]} />);
    const card = cardOf('두잉 댄스');
    expect(within(card).queryByText('다음 일정')).not.toBeInTheDocument();
    const link = within(card).getByRole('link');
    expect(link).toHaveTextContent('지원서 보기');
    expect(link).toHaveClass('btn-secondary');
  });

  it('면접을 끈 모집의 면접 대상 카드는 같은 모집의 심사 중 카드와 똑같다', () => {
    const sectionHtml = (summary: ApplicationSummary): string => {
      const { container, unmount } = render(<SectionApply applications={[summary]} />);
      const html = container.querySelector('[data-section="apply"]')?.innerHTML ?? '';
      unmount();
      return html;
    };
    // 의도한 잠금 — 상태별 속성(data-*·aria-label)을 넣으면 여기서 깨지니 그때 비교 범위를 좁힌다.
    expect(sectionHtml(leftover)).toBe(sectionHtml({ ...leftover, status: 'SUBMITTED', interview: null }));
  });
});

describe('SectionApply — 확정 면접이 끝나면 다음 일정으로 안내하지 않는다', () => {
  const SCHEDULED_INTERVIEW: AssignedInterview = {
    startAt: '2026-11-10T14:00:00',
    endAt: '2026-11-10T14:30:00',
    location: '학생회관 302호',
  };
  const scheduled: ApplicationSummary = {
    ...base,
    status: 'INTERVIEW_PENDING',
    interview: SCHEDULED_INTERVIEW,
    useInterview: true,
  };

  const expectUpcoming = (card: HTMLElement) => {
    expect(within(card).getByText('다음 일정')).toBeInTheDocument();
    expect(within(card).getByText(/면접: .+ — 학생회관 302호/)).toBeInTheDocument();
    expect(within(card).getByText('면접: 2026.11.10 14:00')).toBeInTheDocument();
    expect(card).toHaveClass('border-ink');
    const link = within(card).getByRole('link');
    expect(link).toHaveTextContent('면접 일정 보기');
    expect(link).toHaveClass('btn-primary');
  };

  const expectEnded = (card: HTMLElement) => {
    expect(within(card).queryByText('다음 일정')).not.toBeInTheDocument();
    expect(card.textContent).not.toMatch(/면접:/);
    expect(card.textContent).not.toContain('학생회관 302호');
    expect(within(card).getByText('동아리에서 심사 중입니다')).toBeInTheDocument();
    expect(card).toHaveClass('border-line');
    expect(card).not.toHaveClass('border-ink');
    const link = within(card).getByRole('link');
    expect(link).toHaveTextContent('지원서 보기');
    expect(link).toHaveClass('btn-secondary');
    expect(link).toHaveAttribute('href', '/me/applications/1');
    // 진행 막대는 그대로 면접 단계다 — 결과가 나올 때까지 면접 대상이다.
    expect(within(card).getByText('면접')).toHaveClass('font-bold');
  };

  it.each([
    ['시작 전', '2026-11-10T13:00:00+09:00'],
    // 진행 중(시작은 지났고 끝나지 않음)에도 장소가 필요하다 — 늦게 온 지원자, 여러 명이 나눠 쓰는 긴 슬롯.
    ['시작 직후', '2026-11-10T14:10:00+09:00'],
    ['끝나기 1초 전', '2026-11-10T14:29:59+09:00'],
  ])('%s에는 지금처럼 다음 일정이다', (_case, now) => {
    vi.setSystemTime(new Date(now));
    render(<SectionApply applications={[scheduled]} />);
    expectUpcoming(cardOf('두잉 댄스'));
  });

  it.each([
    ['끝 시각', '2026-11-10T14:30:00+09:00'],
    ['다음 날 아침', '2026-11-11T09:00:00+09:00'],
  ])('%s에는 다음 일정·면접 안내 없이 결과를 기다리는 카드다', (_case, now) => {
    vi.setSystemTime(new Date(now));
    render(<SectionApply applications={[scheduled]} />);
    expectEnded(cardOf('두잉 댄스'));
  });

  it('끝 시각은 기기 시간대와 상관없이 한국 시간으로 읽는다', () => {
    const originalTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      vi.setSystemTime(new Date('2026-11-10T15:00:00+09:00'));
      render(<SectionApply applications={[scheduled]} />);
      expectEnded(cardOf('두잉 댄스'));
    } finally {
      // undefined 를 대입하면 문자열 "undefined" 가 들어가 UTC 로 동작한다 — 원래 없었으면 지운다.
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });

  it('읽지 못하는 끝 시각은 끝나지 않은 쪽(지금 화면)으로 둔다', () => {
    vi.setSystemTime(new Date('2026-11-11T09:00:00+09:00'));
    render(<SectionApply applications={[{ ...scheduled, interview: { ...SCHEDULED_INTERVIEW, endAt: 'not-a-time' } }]} />);
    expect(within(cardOf('두잉 댄스')).getByText('다음 일정')).toBeInTheDocument();
  });

  it('끝난 카드와 다가올 카드가 섞여도 카드마다 자기 면접 시각을 따른다', () => {
    vi.setSystemTime(new Date('2026-11-11T09:00:00+09:00'));
    render(
      <SectionApply
        applications={[
          { ...scheduled, id: 1, clubName: '끝난 동아리' },
          {
            ...scheduled,
            id: 2,
            clubName: '다가올 동아리',
            interview: { startAt: '2026-11-12T14:00:00', endAt: '2026-11-12T14:30:00', location: '학생회관 302호' },
          },
        ]}
      />,
    );
    expect(within(cardOf('끝난 동아리')).queryByText('다음 일정')).not.toBeInTheDocument();
    expect(within(cardOf('다가올 동아리')).getByText('다음 일정')).toBeInTheDocument();
  });

  it('배정 없는 면접 대상은 시각과 상관없이 지금처럼 다음 일정이다', () => {
    vi.setSystemTime(new Date('2026-11-11T09:00:00+09:00'));
    render(<SectionApply applications={[{ ...scheduled, interview: null }]} />);
    const card = cardOf('두잉 댄스');
    expect(within(card).getByText('다음 일정')).toBeInTheDocument();
    expect(within(card).getByRole('link')).toHaveTextContent('면접 일정 보기');
  });
});
