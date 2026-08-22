import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUserSearchResult } from '@duing/types';

const mockUseAdminUserSearchQuery = vi.fn();
vi.mock('@duing/hooks', () => ({
  useAdminUserSearchQuery: (...args: unknown[]) => mockUseAdminUserSearchQuery(...args),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);
// 디바운스는 즉시 통과시켜 입력 → 결과 노출을 동기적으로 검증한다.
vi.mock('@/app/admin/_hooks/useDebouncedValue', () => ({
  useDebouncedValue: (value: string) => value,
}));

import { LeaderSearchCombobox } from '../../../app/admin/clubs/_components/LeaderSearchCombobox';

const USER_1: AdminUserSearchResult = {
  id: 1,
  studentId: '20231234',
  name: '홍길동',
  role: 'STUDENT',
  grade: 'JUNIOR',
  college: 'IT_ENGINEERING',
  major: '컴퓨터공학',
};
const USER_2: AdminUserSearchResult = {
  id: 2,
  studentId: '20235678',
  name: '김철수',
  role: 'STUDENT',
  grade: 'SENIOR',
  college: 'DESIGN_ART',
  major: '',
};
const USERS: AdminUserSearchResult[] = [USER_1, USER_2];

function mockSearch(content: AdminUserSearchResult[]) {
  mockUseAdminUserSearchQuery.mockReturnValue({
    data: { content },
    isLoading: false,
    isFetching: false,
  });
}

describe('LeaderSearchCombobox', () => {
  it('검색어 입력 시 결과가 listbox 로 노출되고 ↓ + Enter 로 선택된다', () => {
    mockSearch(USERS);
    const onSelect = vi.fn();
    render(<LeaderSearchCombobox selectedLeader={null} onSelect={onSelect} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: '홍' } });

    expect(screen.getByRole('option', { name: /홍길동/ })).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith(USER_1);
  });

  it('마우스 클릭으로도 결과가 선택된다', () => {
    mockSearch(USERS);
    const onSelect = vi.fn();
    render(<LeaderSearchCombobox selectedLeader={null} onSelect={onSelect} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '김' } });
    fireEvent.click(screen.getByRole('option', { name: /김철수/ }));

    expect(onSelect).toHaveBeenCalledWith(USER_2);
  });

  it('선택된 회장은 변경 버튼으로 초기화된다', () => {
    mockSearch([]);
    const onSelect = vi.fn();
    render(<LeaderSearchCombobox selectedLeader={USER_1} onSelect={onSelect} />);

    expect(screen.getByText('홍길동')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '변경' }));

    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
