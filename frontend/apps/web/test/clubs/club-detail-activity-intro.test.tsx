import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClubProject } from '@duing/types';

import { ClubDetailActivityIntro } from '../../app/clubs/[clubId]/_components/ClubDetailActivityIntro';

// 단언이 실패해도 console.error 가 막힌 채 남지 않게 매 테스트 뒤 되돌린다.
afterEach(() => vi.restoreAllMocks());

// "이런 활동을 해요" 랜딩 섹션 — 주요 프로젝트를 KPI 가 아닌 활동 소개 카드로 보여준다.
describe('ClubDetailActivityIntro', () => {
  it('아이콘 배지 + 활동명 + 한 줄 설명 카드를 렌더한다', () => {
    const projects: ClubProject[] = [
      { icon: 'CODE', title: '프로젝트 개발', subtitle: '팀을 이루어 실제 서비스를 개발합니다.' },
    ];
    const { container } = render(<ClubDetailActivityIntro projects={projects} />);
    expect(screen.getByText('이런 활동을 해요')).toBeInTheDocument();
    expect(screen.getByText('프로젝트 개발')).toBeInTheDocument();
    expect(screen.getByText('팀을 이루어 실제 서비스를 개발합니다.')).toBeInTheDocument();
    // 아이콘 배지의 svg 가 함께 렌더된다.
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('subtitle 이 null 이면 설명 줄을 생략한다', () => {
    const projects: ClubProject[] = [{ icon: 'CODE', title: '프로젝트 개발', subtitle: null }];
    render(<ClubDetailActivityIntro projects={projects} />);
    const title = screen.getByText('프로젝트 개발');
    const card = title.closest('li');
    expect(card).not.toBeNull();
    // 아이콘(svg)엔 텍스트가 없으므로 카드 텍스트는 제목뿐이어야 한다.
    expect(card?.textContent).toBe('프로젝트 개발');
  });

  it('백엔드가 먼저 배포한 모르는 아이콘 값이 와도 카드와 아이콘 자리를 경고 없이 그린다', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const projects: ClubProject[] = [
      { icon: 'NEW_ICON' as unknown as ClubProject['icon'], title: '새 활동', subtitle: null },
    ];

    render(<ClubDetailActivityIntro projects={projects} />);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    const card = screen.getByText('새 활동').closest('li');
    expect(card).not.toBeNull();
    expect(card?.querySelector('span > svg')).not.toBeNull();
  });

  it('프로젝트가 0개면 섹션을 렌더하지 않는다 (null 반환)', () => {
    const { container } = render(<ClubDetailActivityIntro projects={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
