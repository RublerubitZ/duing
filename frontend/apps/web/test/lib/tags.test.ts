import { describe, expect, it } from 'vitest';
import { appendTag, normalizeTag } from '../../app/_lib/tags';

// 서버 TagRules.normalize 와 같은 정리 — 칩에 보이는 값이 저장되는 값과 같아야 한다.
describe('normalizeTag', () => {
  it('제어문자·보이지 않는 서식 문자·앞뒤 공백을 지우고, 줄바꿈 없는 공백은 일반 공백으로 바꾼다', () => {
    expect(normalizeTag(' 학사\t장학 ')).toBe('학사장학');
    expect(normalizeTag('\u00A0축구\u202F')).toBe('축구');
    expect(normalizeTag('\uFEFF축\u200B구')).toBe('축구');
    expect(normalizeTag('축\u00A0구')).toBe('축 구');
  });

  it('분해된 한글은 합친다', () => {
    expect(normalizeTag('\u1100\u1161\u11BC')).toBe('강');
  });

  it('이모지 조합에 쓰는 ZWJ 는 지우지 않는다', () => {
    expect(normalizeTag('코딩👨\u200D💻')).toBe('코딩👨\u200D💻');
  });
});

describe('appendTag', () => {
  it('같아 보이는 태그는 이미 있는 태그로 보고 넣지 않는다', () => {
    const tags = ['축구'];

    expect(appendTag(tags, '축\u200B구', { maxTags: 5, maxTagLength: 5 })).toBe(tags);
  });
});
