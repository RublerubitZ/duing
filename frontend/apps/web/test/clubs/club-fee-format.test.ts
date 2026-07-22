import { describe, expect, it } from 'vitest';
import { formatClubFee } from '@/app/_lib/clubFee';

describe('formatClubFee', () => {
  it('학기당 30000원을 "학기당 30,000원"으로 표기한다', () => {
    expect(formatClubFee('SEMESTER', 30000)).toBe('학기당 30,000원');
  });
  it('1회 납부는 "1회 납부 50,000원"으로 표기한다', () => {
    expect(formatClubFee('ONE_TIME', 50000)).toBe('1회 납부 50,000원');
  });
  it('NONE 은 null 을 반환한다 — 미입력과 구분할 수 없으므로 표기하지 않는다(§8)', () => {
    expect(formatClubFee('NONE', null)).toBeNull();
  });
  it('금액이 없으면 null 을 반환한다 (방어)', () => {
    expect(formatClubFee('SEMESTER', null)).toBeNull();
  });
});
