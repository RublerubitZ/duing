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
  it('toCreatePayload: 입력된 행사 필드가 그대로 담기고 contentFormat 이 HTML 이다', () => {
    const payload = toCreatePayload(filledEvent);
    expect(payload.eventStartAt).toBe('2026-09-25T10:00');
    expect(payload.eventEndAt).toBe('2026-09-27T18:00');
    expect(payload.location).toBe('중앙광장');
    expect(payload.contentFormat).toBe('HTML');
  });

  it('toCreatePayload: 폼 상태가 MARKDOWN 이어도 저장 포맷은 HTML 로 고정된다', () => {
    // 리치 에디터로 편집하면 본문은 항상 HTML 로 출력되므로, 기존 MARKDOWN 공지도 저장 시 HTML 로 전환된다.
    const payload = toCreatePayload({ ...EMPTY_NOTICE_FORM, contentFormat: 'MARKDOWN', coverImageUrl: 'https://x/c.png' });
    expect(payload.contentFormat).toBe('HTML');
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

  it('toUpdatePayload: 외부 링크를 비우면 clearExternalLink=true 와 linkUrl=null 을 보낸다', () => {
    const payload = toUpdatePayload({ ...filledEvent, linkUrl: '   ' });
    expect(payload.clearExternalLink).toBe(true);
    expect(payload.linkUrl).toBeNull();
  });

  it('toUpdatePayload: 외부 링크가 있으면 clearExternalLink 를 보내지 않고 링크를 그대로 담는다', () => {
    const payload = toUpdatePayload({ ...filledEvent, linkUrl: 'https://example.com/apply' });
    expect(payload.clearExternalLink).toBeUndefined();
    expect(payload.linkUrl).toBe('https://example.com/apply');
  });

  it('toUpdatePayload: 만료일을 비우면 clearExpiresAt=true 와 expiresAt=null 을 보낸다', () => {
    const payload = toUpdatePayload({ ...filledEvent, expiresAt: null });
    expect(payload.clearExpiresAt).toBe(true);
    expect(payload.expiresAt).toBeNull();
  });

  it('toUpdatePayload: 만료일이 있으면 clearExpiresAt 를 보내지 않고 만료일을 그대로 담는다', () => {
    const payload = toUpdatePayload({ ...filledEvent, expiresAt: '2026-12-31T23:59' });
    expect(payload.clearExpiresAt).toBeUndefined();
    expect(payload.expiresAt).toBe('2026-12-31T23:59');
  });
});
