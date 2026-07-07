import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn<() => string>();
vi.mock('next/navigation', () => ({ usePathname: () => mockUsePathname() }));

import { InfoNavLink } from '../../app/_components/InfoNavLink';

// hover 지원 기기 게이트(matchMedia('(hover: hover)')) 제어용 — 기본은 hover 지원(PC).
const mockMatchMediaMatches = { value: true };

beforeEach(() => {
  window.localStorage.clear();
  mockMatchMediaMatches.value = true;
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({ matches: mockMatchMediaMatches.value })),
  );
});

describe('InfoNavLink — HomeNav 용 정보 링크 슬롯', () => {
  it('방문 이력이 없으면 /notices 로 이동한다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('href', '/notices');
  });

  it('마지막 방문 허브 경로로 이동한다', () => {
    window.localStorage.setItem('duing:info-last-path', '/introduce');
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('href', '/introduce');
  });

  it('className 을 링크에 전달한다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink className="text-charcoal-3" />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveClass('text-charcoal-3');
  });
});

describe('InfoNavLink — Hover Quick Menu', () => {
  it('기본 상태에서는 Quick Menu 가 닫혀 있다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('마우스 hover 시 허브 4개로 직행하는 Quick Menu 를 펼친다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    fireEvent.mouseOver(screen.getByRole('link', { name: '정보' }));

    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: '공지' })).toHaveAttribute('href', '/notices');
    expect(screen.getByRole('link', { name: '자주 묻는 질문' })).toHaveAttribute('href', '/faq');
    expect(screen.getByRole('link', { name: '운영정책' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: '서비스 소개' })).toHaveAttribute('href', '/introduce');
  });

  it('Quick Menu 항목은 마지막 방문 경로가 아니라 각자 URL 로 직행한다', () => {
    window.localStorage.setItem('duing:info-last-path', '/terms');
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    fireEvent.mouseOver(screen.getByRole('link', { name: '정보' }));

    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: '공지' })).toHaveAttribute('href', '/notices');
  });

  it('마우스가 떠나면 Quick Menu 를 닫는다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    const trigger = screen.getByRole('link', { name: '정보' });
    fireEvent.mouseOver(trigger);
    expect(screen.getAllByRole('link')).toHaveLength(5);

    fireEvent.mouseOut(trigger, { relatedTarget: document.body });
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('Escape 로 Quick Menu 를 닫는다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    const trigger = screen.getByRole('link', { name: '정보' });
    fireEvent.mouseOver(trigger);
    expect(screen.getAllByRole('link')).toHaveLength(5);

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('키보드 포커스 진입으로도 열리고, 포커스가 밖으로 나가면 닫힌다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    const trigger = screen.getByRole('link', { name: '정보' });

    fireEvent.focus(trigger);
    expect(screen.getAllByRole('link')).toHaveLength(5);

    fireEvent.blur(trigger, { relatedTarget: document.body });
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('hover 미지원 기기(터치)에서는 mouseOver 로 메뉴가 열리지 않는다', () => {
    mockMatchMediaMatches.value = false;
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    fireEvent.mouseOver(screen.getByRole('link', { name: '정보' }));
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});
