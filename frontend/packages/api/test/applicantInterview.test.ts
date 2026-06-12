import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '../src/client';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

describe('applicantInterview.view', () => {
  it('GET /applications/{id}/interview 의 data 를 언래핑해 반환한다', async () => {
    server.use(
      http.get('*/applications/42/interview', () =>
        HttpResponse.json({
          ok: true,
          data: {
            phase: 'AVAILABILITY_REQUESTED',
            availabilityDeadline: '2026-06-20T18:00:00',
            slots: [
              { slotId: 1, startTime: '2026-06-21T10:00:00', endTime: '2026-06-21T10:30:00', selected: false },
              { slotId: 2, startTime: '2026-06-21T11:00:00', endTime: '2026-06-21T11:30:00', selected: true },
            ],
            myAlternativeText: null,
            scheduledInterview: null,
          },
          message: null,
        }),
      ),
    );

    const interviewView = await client.applicantInterview.view(42);

    expect(interviewView.phase).toBe('AVAILABILITY_REQUESTED');
    expect(interviewView.availabilityDeadline).toBe('2026-06-20T18:00:00');
    expect(interviewView.slots).toHaveLength(2);
    const secondSlot = interviewView.slots?.[1];
    expect(secondSlot?.selected).toBe(true);
    expect(interviewView.scheduledInterview).toBeNull();
  });
});

describe('applicantInterview.respond', () => {
  it('슬롯 선택 경로: slotIds 를 body 에 담아 PUT 하고 noAvailableSlot 이 없다', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.put('*/applications/42/interview-availability', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    await client.applicantInterview.respond(42, { slotIds: [1, 3] });

    expect(capturedBody).toEqual({ slotIds: [1, 3] });
    expect((capturedBody as Record<string, unknown>)['noAvailableSlot']).toBeUndefined();
  });

  it('가능없음 경로: noAvailableSlot=true + alternativeText 를 body 에 담아 PUT 하고 slotIds 가 없다', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.put('*/applications/42/interview-availability', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    await client.applicantInterview.respond(42, {
      noAvailableSlot: true,
      alternativeText: '해당 날짜는 모두 불가합니다.',
    });

    expect((capturedBody as Record<string, unknown>)['noAvailableSlot']).toBe(true);
    expect((capturedBody as Record<string, unknown>)['alternativeText']).toBe('해당 날짜는 모두 불가합니다.');
    expect((capturedBody as Record<string, unknown>)['slotIds']).toBeUndefined();
  });
});
