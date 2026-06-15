import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { GradeSelect } from '../../../app/(auth)/signup/_components/GradeSelect';

describe('GradeSelect', () => {
  it('휴학생·졸업생을 학년 선택지로 노출하고, 졸업유예는 노출하지 않는다', () => {
    render(<GradeSelect value="" onChange={vi.fn()} />);

    expect(screen.getByRole('option', { name: '휴학생' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '졸업생' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '1학년' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '졸업유예' })).not.toBeInTheDocument();
  });
});
