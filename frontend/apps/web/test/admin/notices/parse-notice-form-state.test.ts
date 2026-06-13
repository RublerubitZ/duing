import { describe, expect, it } from 'vitest';
import {
  EMPTY_NOTICE_FORM,
  toCreatePayload,
  toUpdatePayload,
  type NoticeFormState,
} from '../../../app/admin/notices/_lib/parseNoticeFormState';

const filledEvent: NoticeFormState = {
  ...EMPTY_NOTICE_FORM,
  title: '박람회',
  summary: '요약',
  coverImageUrl: 'https://x/c.png',
  eventStartAt: '2026-09-25T10:00',
  eventEndAt: '2026-09-27T18:00',
  location: '중앙광장',
  host: '학생자치회',
  audience: '재학생',
};

describe('parseNoticeFormState', () => {
  it('toCreatePayload: 입력된 행사 필드와 본문 이미지가 그대로 담긴다', () => {
    const payload = toCreatePayload(filledEvent);
    expect(payload.eventStartAt).toBe('2026-09-25T10:00');
    expect(payload.eventEndAt).toBe('2026-09-27T18:00');
    expect(payload.location).toBe('중앙광장');
  });

  it('toCreatePayload: 비어 있는 행사 필드는 null 로 변환된다', () => {
    const payload = toCreatePayload({ ...EMPTY_NOTICE_FORM, coverImageUrl: 'https://x/c.png' });
    expect(payload.eventStartAt).toBeNull();
    expect(payload.eventEndAt).toBeNull();
    expect(payload.location).toBeNull();
    expect(payload.host).toBeNull();
    expect(payload.audience).toBeNull();
  });

  it('toUpdatePayload: 행사 필드가 모두 비면 clearEvent=true 를 보낸다', () => {
    const payload = toUpdatePayload({ ...EMPTY_NOTICE_FORM, coverImageUrl: 'https://x/c.png' });
    expect(payload.clearEvent).toBe(true);
    expect(payload.eventStartAt).toBeNull();
  });

  it('toUpdatePayload: 행사 필드가 하나라도 있으면 clearEvent 를 보내지 않는다', () => {
    const payload = toUpdatePayload(filledEvent);
    expect(payload.clearEvent).toBeUndefined();
    expect(payload.location).toBe('중앙광장');
  });
});
