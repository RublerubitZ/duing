import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Loading from '@/app/clubs/[clubId]/loading';

describe('app/clubs/[clubId]/loading.tsx — 동아리 상세 경로 로딩 경계', () => {
  it('스피너 대신 화면 안 로딩과 같은 스켈레톤을 지연 래퍼 안에 그린다', () => {
    render(<Loading />);

    const skeleton = screen.getByRole('status', { name: '동아리 정보 불러오는 중' });
    expect(skeleton.parentElement).toHaveClass('delayed-show');
    // 둘 다 animation 축약이라 같은 요소면 delayed-show 가 펄스를 지운다.
    expect(skeleton).not.toHaveClass('delayed-show');
    expect(screen.queryByRole('status', { name: '페이지 불러오는 중' })).toBeNull();
  });
});
