import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SectionApply } from '@/app/me/_components/SectionApply';
import { SectionArchived } from '@/app/me/_components/SectionArchived';
import { SectionInquiries } from '@/app/me/_components/SectionInquiries';
import { SectionMyClubs } from '@/app/me/_components/SectionMyClubs';
import { SectionSaved } from '@/app/me/_components/SectionSaved';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// 조회 중에는 "없음"이 아니라 "아직 모름"이다(#1500) — 빈 문구·"· 0" 대신 스켈레톤, 조회가 끝난 빈 목록은 빈 문구 그대로.
// 첫 조회가 실패해 받은 목록이 없을 때도 "없음"이 아니다(#1579) — 빈 문구·"· 0" 대신 실패 안내와 다시 시도.
const cases = [
  {
    title: '진행 중인 지원',
    empty: '진행 중인 지원이 없어요.',
    failedMessage: '진행 중인 지원을 불러오지 못했어요.',
    pending: () => <SectionApply applications={[]} isPending />,
    settled: () => <SectionApply applications={[]} />,
    loadFailed: (onRetry: () => void) => <SectionApply applications={[]} onRetry={onRetry} />,
  },
  {
    title: '가입한 동아리',
    empty: '아직 가입한 동아리가 없어요.',
    failedMessage: '가입한 동아리를 불러오지 못했어요.',
    pending: () => <SectionMyClubs myClubs={[]} isPending />,
    settled: () => <SectionMyClubs myClubs={[]} />,
    loadFailed: (onRetry: () => void) => <SectionMyClubs myClubs={[]} onRetry={onRetry} />,
  },
  {
    title: '찜한 동아리',
    empty: '아직 찜한 동아리가 없어요.',
    failedMessage: '찜한 동아리를 불러오지 못했어요.',
    pending: () => <SectionSaved favorites={[]} totalCount={0} isPending />,
    settled: () => <SectionSaved favorites={[]} totalCount={0} />,
    loadFailed: (onRetry: () => void) => <SectionSaved favorites={[]} totalCount={0} onRetry={onRetry} />,
  },
  {
    title: '내 문의',
    empty: '아직 문의 내역이 없어요.',
    failedMessage: '내 문의를 불러오지 못했어요.',
    pending: () => <SectionInquiries inquiries={[]} totalCount={0} isPending />,
    settled: () => <SectionInquiries inquiries={[]} totalCount={0} />,
    loadFailed: (onRetry: () => void) => <SectionInquiries inquiries={[]} totalCount={0} onRetry={onRetry} />,
  },
  {
    title: '지난 지원',
    empty: '지난 지원 내역이 없어요.',
    failedMessage: '지난 지원을 불러오지 못했어요.',
    pending: () => <SectionArchived applications={[]} isPending />,
    settled: () => <SectionArchived applications={[]} />,
    loadFailed: (onRetry: () => void) => <SectionArchived applications={[]} onRetry={onRetry} />,
  },
];

describe('마이페이지 섹션 — 조회 중에는 빈 상태 대신 스켈레톤', () => {
  it.each(cases)('$title: 조회 중이면 숫자 없는 제목 + 스켈레톤, 빈 문구 없음', ({ title, empty, pending }) => {
    render(pending());
    expect(screen.getByRole('status', { name: `${title} 불러오는 중` })).toBeInTheDocument();
    expect(screen.getByText(title, { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(empty.replace(/\.$/, '')))).not.toBeInTheDocument();
  });

  it.each(cases)('$title: 조회가 끝난 빈 목록은 빈 문구·"· 0" 그대로', ({ title, empty, settled }) => {
    render(settled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText(`${title} · 0`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(empty.replace(/\.$/, '')))).toBeInTheDocument();
  });
});

describe('마이페이지 섹션 — 첫 조회가 실패하면 빈 상태 대신 실패 안내와 다시 시도', () => {
  it.each(cases)(
    '$title: 숫자 없는 제목 + 실패 안내 + 다시 시도(설명으로 문구를 잇는다), 빈 문구·스켈레톤 없음 · 누르면 onRetry',
    async ({ title, empty, failedMessage, loadFailed }) => {
      const onRetry = vi.fn();
      render(loadFailed(onRetry));

      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
      expect(screen.getByText(failedMessage)).toBeInTheDocument();
      expect(screen.queryByText(new RegExp(empty.replace(/\.$/, '')))).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      const retryButton = screen.getByRole('button', { name: '다시 시도' });
      // 버튼 목록으로 훑어도 어느 목록의 다시 시도인지 들리게 — 이름은 '다시 시도' 그대로, 설명이 문구다.
      expect(retryButton).toHaveAccessibleDescription(failedMessage);

      await userEvent.click(retryButton);

      expect(onRetry).toHaveBeenCalledTimes(1);
    },
  );
});
