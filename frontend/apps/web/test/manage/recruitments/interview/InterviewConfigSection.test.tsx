import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { InterviewConfigSection } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_components/InterviewConfigSection';

// InterviewConfigSection — datetime-local 의 min 속성이 모집 시작일과 정렬되는지 + 카피 검증.

const RECRUITMENT_ID = 42;
const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderSection(opts: { recruitmentStartDate?: string | null } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  }

  return render(
    <Wrapper>
      <InterviewConfigSection
        recruitmentId={RECRUITMENT_ID}
        config={null}
        recruitmentStartDate={opts.recruitmentStartDate ?? null}
      />
    </Wrapper>,
  );
}

describe('InterviewConfigSection — 라벨/헬프 카피', () => {
  it('지원자 관점의 라벨/헬프 문구가 노출된다', () => {
    renderSection({ recruitmentStartDate: '2099-01-01' });

    expect(screen.getByLabelText('지원자 가능시간 제출 마감')).toBeInTheDocument();
    expect(
      screen.getByText(/지원자가 자신의 면접 가능시간을 제출할 수 있는 마감 시각입니다/),
    ).toBeInTheDocument();
  });
});

describe('InterviewConfigSection — datetime-local min (백엔드 startDate < deadline 정렬)', () => {
  it('미래 모집 시작일이 주어지면 input min 이 startDate+1일 00:00 으로 설정된다', () => {
    renderSection({ recruitmentStartDate: '2099-01-01' });

    const input = screen.getByLabelText('지원자 가능시간 제출 마감') as HTMLInputElement;
    expect(input.min).toBe('2099-01-02T00:00');
  });

  it('과거 모집 시작일이 주어지면 input min 이 현재 시각으로 fallback 된다', () => {
    renderSection({ recruitmentStartDate: '2000-01-01' });

    const input = screen.getByLabelText('지원자 가능시간 제출 마감') as HTMLInputElement;
    // startDate+1d (2000-01-02T00:00) 보다 현재 시각이 더 크므로 nowLocal 이 적용됨.
    expect(input.min).not.toBe('2000-01-02T00:00');
    expect(input.min).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('recruitmentStartDate 가 null 이면 input min 이 현재 시각으로 fallback 된다', () => {
    renderSection({ recruitmentStartDate: null });

    const input = screen.getByLabelText('지원자 가능시간 제출 마감') as HTMLInputElement;
    expect(input.min).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
