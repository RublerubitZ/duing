import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteLoading } from '@/app/_components/RouteLoading';

describe('RouteLoading', () => {
  it('스크린리더에 로딩 상태를 알리고 기존 로딩 문구 컨벤션을 따른다', () => {
    render(<RouteLoading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
  });
});
