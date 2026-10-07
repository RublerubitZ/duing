import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Loading from '@/app/clubs/loading';

describe('app/clubs/loading.tsx — 동아리 탐색 전용 로딩 경계', () => {
  it('탐색 전체 스켈레톤을 지연 래퍼 안에 그린다', () => {
    render(<Loading />);

    const skeleton = screen.getByRole('status', { name: '동아리 목록 불러오는 중' });
    expect(skeleton.parentElement).toHaveClass('delayed-show');
    // 둘 다 animation 축약이라 같은 요소면 delayed-show 가 펄스를 지운다.
    expect(skeleton).not.toHaveClass('delayed-show');
  });
});
