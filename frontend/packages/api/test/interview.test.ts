import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '../src/client';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

describe('interviews.createSlots', () => {
  it('정확한 URL + body 로 POST 한다', async () => {
    let captured: unknown = null;
    server.use(
      http.post('*/recruitments/10/interview-slots', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          ok: true,
          data: { slotIds: [101, 102] },
          message: null,
        });
      }),
    );

    const result = await client.interviews.createSlots(10, {
      slots: [{ startTime: '2026-06-18T14:00:00Z', endTime: '2026-06-18T14:30:00Z', capacity: 2 }],
    });

    expect(captured).toEqual({
      slots: [
        { startTime: '2026-06-18T14:00:00Z', endTime: '2026-06-18T14:30:00Z', capacity: 2 },
      ],
    });
    expect(result.slotIds).toEqual([101, 102]);
  });
});

describe('interviews.updateConfig', () => {
  it('location 만 부분 전송이 가능하다', async () => {
    let captured: unknown = null;
    server.use(
      http.patch('*/recruitments/10/interview-config', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    await client.interviews.updateConfig(10, { location: '공학관 2201호' });
    expect(captured).toEqual({ location: '공학관 2201호' });
  });
});
