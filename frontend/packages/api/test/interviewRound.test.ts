import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '../src/client';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

describe('interviewRounds.candidates', () => {
  it('includeUnderReview 파라미터를 포함한 정확한 URL 로 GET 한다', async () => {
    let capturedUrl: string | null = null;
    server.use(
      http.get('*/leader/recruitments/10/interview-round-candidates', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          ok: true,
          data: [
            {
              applicationId: 1,
              userId: 100,
              userName: '홍길동',
              studentId: '2020123456',
              college: 'IT_ENGINEERING',
              major: '컴퓨터공학과',
              grade: 'SOPHOMORE',
              status: 'UNDER_REVIEW',
              submittedAt: '2026-06-01T10:00:00',
            },
          ],
          message: null,
        });
      }),
    );

    const candidates = await client.interviewRounds.candidates(10, true);

    expect(capturedUrl).toContain('includeUnderReview=true');
    expect(candidates).toHaveLength(1);
    const firstCandidate = candidates[0];
    expect(firstCandidate?.userName).toBe('홍길동');
    expect(firstCandidate?.status).toBe('UNDER_REVIEW');
  });
});

describe('interviewRounds.create', () => {
  it('정확한 URL + body 로 POST 하고 roundId 를 반환한다', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post('*/leader/recruitments/10/interview-rounds', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          ok: true,
          data: { roundId: 42 },
          message: null,
        });
      }),
    );

    const result = await client.interviewRounds.create(10, {
      title: '1차 면접',
      availabilityDeadline: '2026-06-20T18:00',
      location: '공학관 2201호',
      applicationIds: [1, 2, 3],
    });

    expect(capturedBody).toEqual({
      title: '1차 면접',
      availabilityDeadline: '2026-06-20T18:00',
      location: '공학관 2201호',
      applicationIds: [1, 2, 3],
    });
    expect(result.roundId).toBe(42);
  });
});

describe('interviewRounds.requestAvailability', () => {
  it('성공 응답의 data(notifiedMemberCount)가 언래핑된다', async () => {
    server.use(
      http.post('*/leader/interview-rounds/42/request-availability', () =>
        HttpResponse.json({
          ok: true,
          data: { notifiedMemberCount: 5 },
          message: null,
        }),
      ),
    );

    const result = await client.interviewRounds.requestAvailability(42);

    expect(result.notifiedMemberCount).toBe(5);
  });
});
