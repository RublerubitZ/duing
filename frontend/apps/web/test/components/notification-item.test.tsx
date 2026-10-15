import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Notification, NotificationType } from '@duing/types';

import { NotificationItem } from '../../app/_components/NotificationItem';
import { blendOver, contrastRatio, parseColorClass, resolveTokenHex } from '../a11y/wcagContrast';

type ExpectedVisual = { label: string; backgroundClass: string; textClass: string };

// 스펙 매핑 표 — Record 라 유니온에 종류를 더하고 여기 행을 빠뜨리면 typecheck 가 깨진다.
const EXPECTED_VISUALS: Record<NotificationType, ExpectedVisual> = {
  INTERVIEW_SCHEDULED: { label: '면접', backgroundClass: 'bg-ink/10', textClass: 'text-ink' },
  INTERVIEW_REMINDER: { label: '면접', backgroundClass: 'bg-ink/10', textClass: 'text-ink' },
  INTERVIEW_AVAILABILITY_REQUESTED: { label: '면접', backgroundClass: 'bg-ink/10', textClass: 'text-ink' },
  INTERVIEW_UPDATED: { label: '면접', backgroundClass: 'bg-ink/10', textClass: 'text-ink' },
  INTERVIEW_CANCELLED: { label: '면접', backgroundClass: 'bg-coral/10', textClass: 'text-coral-deep' },
  RECRUITMENT_OPENED: { label: '모집', backgroundClass: 'bg-sky/10', textClass: 'text-sky-deep' },
  RECRUITMENT_DEADLINE: { label: '마감', backgroundClass: 'bg-coral/10', textClass: 'text-coral-deep' },
  EXTERNAL_RECRUITMENT_STILL_OPEN: { label: '모집', backgroundClass: 'bg-sky/10', textClass: 'text-sky-deep' },
  APPLICATION_RECEIVED: { label: '지원서', backgroundClass: 'bg-sky/10', textClass: 'text-sky-deep' },
  APPLICATION_PENDING_REMINDER: { label: '지원서', backgroundClass: 'bg-coral/10', textClass: 'text-coral-deep' },
  NOTICE_TARGETED: { label: '공지', backgroundClass: 'bg-warm/10', textClass: 'text-warm-deep' },
  FEE_BILL_ISSUED: { label: '회비', backgroundClass: 'bg-pastel-mint-accent/10', textClass: 'text-pastel-mint-deep' },
  FEE_BILL_DUE_SOON: { label: '회비', backgroundClass: 'bg-coral/10', textClass: 'text-coral-deep' },
  FEE_BILL_OVERDUE: { label: '회비', backgroundClass: 'bg-coral/10', textClass: 'text-coral-deep' },
  FEE_PAID_CONFIRMED: { label: '회비', backgroundClass: 'bg-pastel-mint-accent/10', textClass: 'text-pastel-mint-deep' },
  FEE_PARTIAL_PAYMENT_CONFIRMED: {
    label: '회비',
    backgroundClass: 'bg-pastel-mint-accent/10',
    textClass: 'text-pastel-mint-deep',
  },
  FEDERATION_INQUIRY_RECEIVED: {
    label: '문의',
    backgroundClass: 'bg-pastel-lavender-accent/10',
    textClass: 'text-pastel-lavender-deep',
  },
  FEDERATION_INQUIRY_ANSWERED: {
    label: '문의',
    backgroundClass: 'bg-pastel-lavender-accent/10',
    textClass: 'text-pastel-lavender-deep',
  },
  FEDERATION_INQUIRY_CLOSED: {
    label: '문의',
    backgroundClass: 'bg-pastel-lavender-accent/10',
    textClass: 'text-pastel-lavender-deep',
  },
  FACILITY_BOOKING_SUBMITTED: {
    label: '시설',
    backgroundClass: 'bg-pastel-beige-accent/10',
    textClass: 'text-pastel-beige-deep',
  },
  FACILITY_BOOKING_APPROVED: {
    label: '시설',
    backgroundClass: 'bg-pastel-beige-accent/10',
    textClass: 'text-pastel-beige-deep',
  },
  FACILITY_BOOKING_CONFIRMED: {
    label: '시설',
    backgroundClass: 'bg-pastel-beige-accent/10',
    textClass: 'text-pastel-beige-deep',
  },
  FACILITY_BOOKING_REJECTED: { label: '시설', backgroundClass: 'bg-coral/10', textClass: 'text-coral-deep' },
  FACILITY_BOOKING_CONFLICT: { label: '시설', backgroundClass: 'bg-coral/10', textClass: 'text-coral-deep' },
  FACILITY_BOOKING_CANCELLED: { label: '시설', backgroundClass: 'bg-coral/10', textClass: 'text-coral-deep' },
};

const BROADCAST_EXPECTED: ExpectedVisual = { label: '공지', backgroundClass: 'bg-warm/10', textClass: 'text-warm-deep' };
const DEFAULT_EXPECTED: ExpectedVisual = { label: '알림', backgroundClass: 'bg-sage-mist', textClass: 'text-ink-deep' };

const isNotificationType = (value: string): value is NotificationType => value in EXPECTED_VISUALS;
const NOTIFICATION_TYPES = Object.keys(EXPECTED_VISUALS).filter(isNotificationType);

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    source: 'PERSONAL',
    id: 1,
    type: 'RECRUITMENT_OPENED',
    title: '테스트 알림 제목',
    body: '테스트 알림 본문',
    linkUrl: null,
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('NotificationItem — 종류별 배지/시간', () => {
  it('마감 알림(RECRUITMENT_DEADLINE)은 "마감" 배지를 보여준다', () => {
    render(<NotificationItem notification={makeNotification({ type: 'RECRUITMENT_DEADLINE' })} onClick={vi.fn()} />);
    expect(screen.getByText('마감')).toBeInTheDocument();
  });

  it('면접 알림(INTERVIEW_SCHEDULED)은 "면접" 배지를 보여준다', () => {
    render(<NotificationItem notification={makeNotification({ type: 'INTERVIEW_SCHEDULED' })} onClick={vi.fn()} />);
    expect(screen.getByText('면접')).toBeInTheDocument();
  });

  it('공지(BROADCAST)는 type 과 무관하게 "공지" 배지를 보여준다', () => {
    render(<NotificationItem notification={makeNotification({ source: 'BROADCAST', type: null })} onClick={vi.fn()} />);
    expect(screen.getByText('공지')).toHaveClass(BROADCAST_EXPECTED.backgroundClass, BROADCAST_EXPECTED.textClass);
  });

  it('type 이 없으면 기본 "알림" 배지를 보여준다', () => {
    render(<NotificationItem notification={makeNotification({ type: null })} onClick={vi.fn()} />);
    expect(screen.getByText('알림')).toHaveClass(DEFAULT_EXPECTED.backgroundClass, DEFAULT_EXPECTED.textClass);
  });

  it('생성 2시간 전이면 "2시간 전"으로 표기한다', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    render(<NotificationItem notification={makeNotification({ createdAt: twoHoursAgo })} onClick={vi.fn()} />);
    expect(screen.getByText('2시간 전')).toBeInTheDocument();
  });

  it('안읽음이면 코랄 표시점이 있고, 읽음이면 없다', () => {
    const { container, rerender } = render(
      <NotificationItem notification={makeNotification({ isRead: false })} onClick={vi.fn()} />,
    );
    expect(container.querySelector('.bg-coral')).not.toBeNull();

    rerender(<NotificationItem notification={makeNotification({ isRead: true })} onClick={vi.fn()} />);
    expect(container.querySelector('.bg-coral')).toBeNull();
  });

  it('클릭하면 onClick 이 해당 알림으로 호출된다', () => {
    const onClick = vi.fn();
    const notification = makeNotification({ id: 42 });
    render(<NotificationItem notification={notification} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /테스트 알림 제목/ }));
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
  });
});

describe('NotificationItem — 종류별 라벨·색조(스펙 매핑 표)', () => {
  it.each(NOTIFICATION_TYPES)('%s 는 표의 라벨과 색조 클래스로 배지를 그린다', (notificationType) => {
    const expected = EXPECTED_VISUALS[notificationType];
    render(<NotificationItem notification={makeNotification({ type: notificationType })} onClick={vi.fn()} />);
    // toHaveClass 는 클래스 토큰 단위 비교라 text-ink 가 text-ink-deep 에 걸리는 거짓 통과가 없다.
    expect(screen.getByText(expected.label)).toHaveClass(expected.backgroundClass, expected.textClass);
  });
});

// 대비 회귀 가드 — 렌더 className 에는 크기 클래스(text-[10px])가 섞이므로 기대 표의 색 클래스로 계산한다.
// 알림 항목 바탕: 안읽음 흰색, 읽음은 시트·페이지의 크림, 마우스를 올리면 크림2 쪽으로 어두워진다.
const BADGE_SURFACES = { 흰색: '#FFFFFF', 크림: '#F6F3EC', 크림2: '#EFEBE0' } as const;
const SMALL_TEXT_AA = 4.5;

// 브라우저의 /10 8비트 반올림 오차(최대 0.03)는 지금 최솟값(4.61)과 기준(4.5) 사이 여유 안이다.
function worstBadgeContrast({ backgroundClass, textClass }: ExpectedVisual): number {
  const background = parseColorClass(backgroundClass);
  const text = parseColorClass(textClass);
  const backgroundHex = resolveTokenHex(background.tokenPath);
  const textHex = resolveTokenHex(text.tokenPath);
  return Math.min(
    ...Object.values(BADGE_SURFACES).map((surfaceHex) => {
      const badgeBackgroundHex = blendOver(backgroundHex, background.alpha, surfaceHex);
      return contrastRatio(blendOver(textHex, text.alpha, badgeBackgroundHex), badgeBackgroundHex);
    }),
  );
}

const BADGE_TONES = [
  ...new Map(
    [...Object.values(EXPECTED_VISUALS), BROADCAST_EXPECTED, DEFAULT_EXPECTED].map((visual) => [
      `${visual.backgroundClass} ${visual.textClass}`,
      visual,
    ]),
  ).entries(),
];

describe('NotificationItem — 배지 글자 대비(WCAG AA 4.5:1)', () => {
  it.each(BADGE_TONES)('%s 는 흰색·크림·크림2 바탕 모두에서 4.5:1 이상이다', (_tone, visual) => {
    expect(worstBadgeContrast(visual)).toBeGreaterThanOrEqual(SMALL_TEXT_AA);
  });
});
