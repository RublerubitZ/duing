import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { ClubMember } from '@duing/types';

import { MemberRow } from '@/app/manage/clubs/[clubId]/members/_components/MemberRow';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function renderRow(member: ClubMember) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <MemberRow
          clubId={1}
          member={member}
          viewerRole="LEADER"
          viewerUserId={999}
          onTransferLeader={() => undefined}
        />
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

const baseMember: ClubMember = {
  memberId: 1,
  userId: 42,
  name: '구승율',
  studentId: '20210001',
  role: 'MEMBER',
  joinedAt: '2026-01-01',
  major: '컴퓨터정보공학',
  grade: 'SENIOR',
  phoneMasked: '010-****-5678',
};

describe('MemberRow — 프로필 표시', () => {
  it('학과·학년·마스킹된 전화번호를 표시한다', () => {
    renderRow(baseMember);

    expect(screen.getByText(/컴퓨터정보공학/)).toBeInTheDocument();
    expect(screen.getByText(/4학년/)).toBeInTheDocument();
    expect(screen.getByText(/010-\*\*\*\*-5678/)).toBeInTheDocument();
  });

  it('마스킹 전화번호가 null 이면 전화 부분을 표시하지 않는다', () => {
    renderRow({ ...baseMember, phoneMasked: null });

    expect(screen.queryByText(/010-/)).not.toBeInTheDocument();
    expect(screen.getByText(/컴퓨터정보공학/)).toBeInTheDocument();
  });
});
