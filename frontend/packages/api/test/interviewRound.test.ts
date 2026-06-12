import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient, ApiError } from '../src/client';
import { isUnresolvedMembersPayload } from '@duing/types';

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

describe('interviewRounds.autoAssign', () => {
  it('정확한 URL 로 POST 하고 배정 결과를 반환한다', async () => {
    let capturedUrl: string | null = null;
    server.use(
      http.post('*/leader/interview-rounds/42/auto-assign', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          ok: true,
          data: { assignedMemberCount: 3, unassignedMemberCount: 1 },
          message: null,
        });
      }),
    );

    const result = await client.interviewRounds.autoAssign(42);

    expect(capturedUrl).toContain('leader/interview-rounds/42/auto-assign');
    expect(result.assignedMemberCount).toBe(3);
    expect(result.unassignedMemberCount).toBe(1);
  });
});

describe('interviewRounds.excludeMember', () => {
  it('정확한 URL 로 POST 한다', async () => {
    let capturedUrl: string | null = null;
    server.use(
      http.post('*/leader/interview-rounds/42/members/7/exclude', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    await client.interviewRounds.excludeMember(42, 7);

    expect(capturedUrl).toContain('leader/interview-rounds/42/members/7/exclude');
  });
});

describe('interviewRounds.confirm — 409 payload 보존', () => {
  it('409 응답의 data 가 ApiError.payload 에 보존되어 isUnresolvedMembersPayload 로 좁혀진다', async () => {
    const unresolvedBody = {
      ok: false,
      data: {
        code: 'INTERVIEW_ROUND_HAS_UNRESOLVED_MEMBERS',
        unresponded: [
          { applicationId: 1, applicantName: '홍길동', memberStatus: 'INVITED' },
        ],
        respondedUnassigned: [
          { applicationId: 2, applicantName: '김철수', selectedSlotIds: [10, 11] },
        ],
      },
      message: '미처리 멤버가 있습니다.',
    };

    server.use(
      http.post('*/leader/interview-rounds/42/confirm', () =>
        HttpResponse.json(unresolvedBody, { status: 409 }),
      ),
    );

    let caughtError: unknown;
    try {
      await client.interviewRounds.confirm(42, false);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(ApiError);
    if (!(caughtError instanceof ApiError)) {
      throw new Error('ApiError 인스턴스가 아닙니다.');
    }
    expect(caughtError.status).toBe(409);
    expect(caughtError.message).toBe('미처리 멤버가 있습니다.');

    // payload 보존 + 타입 가드
    expect(isUnresolvedMembersPayload(caughtError.payload)).toBe(true);
    if (isUnresolvedMembersPayload(caughtError.payload)) {
      expect(caughtError.payload.code).toBe('INTERVIEW_ROUND_HAS_UNRESOLVED_MEMBERS');
      expect(caughtError.payload.unresponded).toHaveLength(1);
      expect(caughtError.payload.respondedUnassigned).toHaveLength(1);
      const firstUnresponded = caughtError.payload.unresponded[0];
      expect(firstUnresponded?.applicantName).toBe('홍길동');
      const firstRespondedUnassigned = caughtError.payload.respondedUnassigned[0];
      expect(firstRespondedUnassigned?.selectedSlotIds).toEqual([10, 11]);
    }
  });

  it('force=false 쿼리 파라미터가 URL 에 포함된다', async () => {
    let capturedUrl: string | null = null;
    server.use(
      http.post('*/leader/interview-rounds/42/confirm', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          ok: true,
          data: { assignedMemberCount: 5, excludedMemberCount: 0 },
          message: null,
        });
      }),
    );

    await client.interviewRounds.confirm(42, false);

    expect(capturedUrl).toContain('force=false');
  });
});
