import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ClubDetailAbout } from '../../app/clubs/[clubId]/_components/ClubDetailAbout';

// About 은 랜딩 공통 헤더(소개) + Paper Card(본문 + "이런 분께 추천해요" 체크 리스트)를 다룬다.
// 본문=리치 HTML/레거시 plain + 더보기(rest 펼침 또는 장문 클램프 해제), 추천=✓ 체크 리스트.
describe('ClubDetailAbout', () => {
  it('description·highlights 가 모두 비면 null 을 반환한다', () => {
    const { container } = render(<ClubDetailAbout description={null} highlights={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('카드가 렌더될 때 소개 섹션 헤더 문구를 노출한다', () => {
    render(<ClubDetailAbout description="본문" highlights={[]} />);
    expect(screen.getByRole('heading', { name: '소개' })).toBeInTheDocument();
    expect(
      screen.getByText('동아리가 추구하는 문화와 활동 방식을 소개합니다.'),
    ).toBeInTheDocument();
  });

  it('짧은 단일 문단이면 본문만 노출하고 더보기 버튼이 없다', () => {
    render(<ClubDetailAbout description="짧은 소개" highlights={[]} />);
    expect(screen.getByText('짧은 소개')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('HTML 다중 블록: lead 는 노출, rest 는 접힌 채 시작하고 더보기 클릭 시 펼쳐진다', async () => {
    render(<ClubDetailAbout description="<p>리드 문단</p><p>숨겨진 문단</p>" highlights={[]} />);

    expect(screen.getByText('리드 문단')).toBeInTheDocument();

    const panel = screen.getByText('숨겨진 문단').closest('[aria-hidden]');
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    await userEvent.click(screen.getByRole('button', { name: /더보기/ }));

    expect(panel).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByRole('button', { name: /접기/ })).toBeInTheDocument();
  });

  it('plain 다중 문단: 더보기로 나머지 문단을 펼친다', async () => {
    render(<ClubDetailAbout description={'첫 문단\n\n둘째 문단'} highlights={[]} />);

    expect(screen.getByText('첫 문단')).toBeInTheDocument();
    const panel = screen.getByText('둘째 문단').closest('[aria-hidden]');
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    await userEvent.click(screen.getByRole('button', { name: /더보기/ }));
    expect(panel).toHaveAttribute('aria-hidden', 'false');
  });

  it('rest 없이 lead 가 장문이면 클램프하고 더보기 클릭 시 클램프를 해제한다', async () => {
    const longLead = '가'.repeat(230);
    render(<ClubDetailAbout description={longLead} highlights={[]} />);

    const paragraph = screen.getByText(longLead);
    expect(paragraph).toHaveClass('line-clamp-4');

    await userEvent.click(screen.getByRole('button', { name: /더보기/ }));
    expect(paragraph).not.toHaveClass('line-clamp-4');
  });

  it('HTML 장문 단일 블록: 더보기 토글에도 주입된 DOM 노드 identity 가 유지된다 (memo 재주입 없음)', async () => {
    const longHtml = `<p>${'가'.repeat(230)}</p>`;
    const { container } = render(<ClubDetailAbout description={longHtml} highlights={[]} />);

    const injectedBefore = container.querySelector('p');
    await userEvent.click(screen.getByRole('button', { name: /더보기/ }));

    // memo 가 유지되면 innerHTML 이 재설정되지 않아 주입 노드가 동일 객체로 남는다.
    expect(container.querySelector('p')).toBe(injectedBefore);
  });

  it('lead 텍스트가 220자 이하이면 클램프하지 않고 더보기 버튼이 없다 (경계값)', () => {
    render(<ClubDetailAbout description={'가'.repeat(220)} highlights={[]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('highlights 는 "이런 분께 추천해요" 소제목과 ✓ 체크 리스트로 노출된다 (칩 행 아님)', () => {
    render(
      <ClubDetailAbout
        description={null}
        highlights={['성장하고 싶은 사람', '동료가 필요한 사람']}
      />,
    );
    expect(screen.getByText('이런 분께 추천해요')).toBeInTheDocument();
    expect(screen.getByText('성장하고 싶은 사람')).toBeInTheDocument();
    expect(screen.getByText('동료가 필요한 사람')).toBeInTheDocument();

    const list = screen.getByRole('list');
    expect(list).toHaveClass('space-y-2');
    expect(list).not.toHaveClass('flex-wrap'); // 칩 행 제거

    const [firstItem] = screen.getAllByRole('listitem');
    expect(firstItem).not.toHaveClass('rounded-full'); // 칩 아님
  });

  it('본문·highlights 가 모두 있으면 추천 영역 앞에 구분선을 둔다', () => {
    render(<ClubDetailAbout description="본문" highlights={['성장하고 싶은 사람']} />);
    const subtitle = screen.getByText('이런 분께 추천해요');
    expect(subtitle.parentElement).toHaveClass('border-t');
  });

  it('본문 없이 highlights 만 있으면 구분선 없이 추천 영역만 렌더한다', () => {
    render(<ClubDetailAbout description={null} highlights={['성장하고 싶은 사람']} />);
    const subtitle = screen.getByText('이런 분께 추천해요');
    expect(subtitle.parentElement).not.toHaveClass('border-t');
    expect(screen.getByText('성장하고 싶은 사람')).toBeInTheDocument();
  });

  it('highlights 가 비면 추천 영역(소제목·리스트)을 렌더링하지 않는다', () => {
    render(<ClubDetailAbout description="본문" highlights={[]} />);
    expect(screen.getByText('본문')).toBeInTheDocument();
    expect(screen.queryByText('이런 분께 추천해요')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
