import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '../src/client';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

describe('admin.facilitySubmission.list', () => {
  it('page/size 쿼리를 붙여 GET 하고 PageResponse 를 언랩한다', async () => {
    let capturedUrl: string | null = null;
    server.use(
      http.get('*/admin/facility-bookings/submission', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          ok: true,
          data: {
            content: [
              {
                batchId: 1,
                submissionNo: '2026-0001',
                facilityId: 3,
                facilityName: '대운동장',
                bookingCount: 4,
                submittedAt: '2026-07-01T10:00:00',
                submittedByName: '관리자',
                memo: null,
                cancelled: false,
                cancelledAt: null,
                completed: false,
                completedAt: null,
              },
            ],
            page: 0,
            size: 10,
            totalElements: 1,
            totalPages: 1,
            hasNext: false,
          },
          message: null,
        });
      }),
    );

    const pageResult = await client.admin.facilitySubmission.list({ page: 0, size: 10 });

    expect(capturedUrl).toContain('page=0');
    expect(capturedUrl).toContain('size=10');
    expect(pageResult.content).toHaveLength(1);
    expect(pageResult.content[0]?.submissionNo).toBe('2026-0001');
    expect(pageResult.hasNext).toBe(false);
  });
});

describe('admin.facilitySubmission.detail', () => {
  it('batchId 경로로 GET 하고 batch/bookings/audits 를 언랩한다', async () => {
    let capturedUrl: string | null = null;
    server.use(
      http.get('*/admin/facility-bookings/submission/7', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          ok: true,
          data: {
            batch: {
              batchId: 7,
              submissionNo: '2026-0007',
              facilityId: 3,
              facilityName: '대운동장',
              bookingCount: 2,
              submittedAt: '2026-07-01T10:00:00',
              submittedByName: '관리자',
              memo: '7월 제출분',
              cancelled: false,
              cancelledAt: null,
              completed: false,
              completedAt: null,
            },
            bookings: [
              {
                bookingId: 10,
                facilityId: 3,
                facilityName: '대운동장',
                clubId: 5,
                clubName: '축구부',
                applicantName: '홍길동',
                contactPhone: '010-0000-0000',
                reservationDate: '2026-07-10',
                startTime: '10:00',
                endTime: '12:00',
                purpose: '정기 훈련',
                attendeeCount: 20,
                status: 'APPROVED',
                submitted: true,
                selectable: false,
                submissionNo: '2026-0007',
                decidedByName: '관리자',
                decidedAt: '2026-07-01T09:00:00',
              },
            ],
            audits: [
              {
                action: 'CREATED',
                adminName: '관리자',
                createdAt: '2026-07-01T19:00:00',
                ipAddress: '127.0.0.1',
                detail: null,
              },
            ],
          },
          message: null,
        });
      }),
    );

    const detail = await client.admin.facilitySubmission.detail(7);

    expect(capturedUrl).toContain('admin/facility-bookings/submission/7');
    expect(detail.batch.batchId).toBe(7);
    expect(detail.bookings[0]?.bookingId).toBe(10);
    expect(detail.audits[0]?.action).toBe('CREATED');
  });
});

describe('admin.facilitySubmission.complete', () => {
  it('batchId 경로로 POST 하고 완료 결과를 언랩한다', async () => {
    let capturedUrl: string | null = null;
    server.use(
      http.post('*/admin/facility-bookings/submission/7/complete', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          ok: true,
          data: {
            totalCount: 3,
            confirmedCount: 2,
            skippedCount: 1,
            completedAt: '2026-07-02T09:00:00',
            skippedBookings: [
              { bookingId: 11, status: 'CANCELLED', reason: '취소된 예약' },
            ],
          },
          message: null,
        });
      }),
    );

    const result = await client.admin.facilitySubmission.complete(7);

    expect(capturedUrl).toContain('admin/facility-bookings/submission/7/complete');
    expect(result.confirmedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(result.skippedBookings[0]?.reason).toBe('취소된 예약');
  });
});

describe('admin.facilitySubmission.cancel', () => {
  it('batchId 경로로 DELETE 하고 204(본문 없음)를 처리한다', async () => {
    let capturedUrl: string | null = null;
    server.use(
      http.delete('*/admin/facility-bookings/submission/7', ({ request }) => {
        capturedUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(client.admin.facilitySubmission.cancel(7)).resolves.toBeUndefined();

    expect(capturedUrl).toContain('admin/facility-bookings/submission/7');
  });
});
