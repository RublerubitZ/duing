import { render, screen } from '@testing-library/react';
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
const cases = [
  { title: '진행 중인 지원', empty: '진행 중인 지원이 없어요.', pending: () => <SectionApply applications={[]} isPending />, settled: () => <SectionApply applications={[]} /> },
  { title: '가입한 동아리', empty: '아직 가입한 동아리가 없어요.', pending: () => <SectionMyClubs myClubs={[]} isPending />, settled: () => <SectionMyClubs myClubs={[]} /> },
  { title: '찜한 동아리', empty: '아직 찜한 동아리가 없어요.', pending: () => <SectionSaved favorites={[]} isPending />, settled: () => <SectionSaved favorites={[]} /> },
  { title: '내 문의', empty: '아직 문의 내역이 없어요.', pending: () => <SectionInquiries inquiries={[]} totalCount={0} isPending />, settled: () => <SectionInquiries inquiries={[]} totalCount={0} /> },
  { title: '지난 지원', empty: '지난 지원 내역이 없어요.', pending: () => <SectionArchived applications={[]} isPending />, settled: () => <SectionArchived applications={[]} /> },
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
