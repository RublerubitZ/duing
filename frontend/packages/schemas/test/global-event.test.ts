import { describe, it, expect } from 'vitest';
import { createGlobalEventSchema } from '../src/index';

const validEvent = {
  title: '동아리 박람회',
  startAt: '2026-11-02T10:00',
  endAt: '2026-11-02T17:00',
  category: 'FAIR',
} as const;

describe('createGlobalEventSchema — 카테고리', () => {
  it('유효한 카테고리는 통과한다', () => {
    expect(createGlobalEventSchema.safeParse(validEvent).success).toBe(true);
  });

  it('카테고리를 고르지 않으면(빈 값) "카테고리를 선택해주세요." 로 안내한다', () => {
    const parsed = createGlobalEventSchema.safeParse({ ...validEvent, category: '' });
    expect(parsed.error?.issues).toEqual([
      expect.objectContaining({ path: ['category'], message: '카테고리를 선택해주세요.' }),
    ]);
  });
});
