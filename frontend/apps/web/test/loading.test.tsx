import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Loading from '@/app/loading';

describe('app/loading.tsx (루트 로딩 경계)', () => {
  it('RouteLoading 을 렌더해 로딩 상태를 알린다', () => {
    render(<Loading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
