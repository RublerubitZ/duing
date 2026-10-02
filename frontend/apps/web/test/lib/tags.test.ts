import { describe, expect, it } from 'vitest';
import { appendTag, normalizeTag, tagLabel } from '../../app/_lib/tags';

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

  it('앞의 # 는 지운다 — 화면이 태그 앞에 # 를 붙여 보여 준다', () => {
    expect(normalizeTag('#축구')).toBe('축구');
    expect(normalizeTag('##축구')).toBe('축구');
    expect(normalizeTag('# 축구')).toBe('축구');
    expect(normalizeTag('C#')).toBe('C#');
    expect(normalizeTag('#')).toBe('');
  });

  it('# 와 공백이 섞여 있어도 앞의 # 를 끝까지 지우고, 키캡 이모지의 # 는 남긴다', () => {
    expect(normalizeTag('# #축구')).toBe('축구');
    expect(normalizeTag('#\u3000#축구')).toBe('축구');
    expect(normalizeTag('# #')).toBe('');
    expect(normalizeTag('#\uFE0F\u20E3번호')).toBe('#\uFE0F\u20E3번호');
    expect(normalizeTag('#\uFE0E\u20E3')).toBe('#\uFE0E\u20E3');
    expect(normalizeTag('#\u20E3')).toBe('#\u20E3');
    expect(normalizeTag('##\uFE0F\u20E3')).toBe('#\uFE0F\u20E3');
  });

  it('키캡이 아닌 # 는 뒤에 붙은 변형 선택자와 함께 지운다', () => {
    expect(normalizeTag('#\uFE0F밴드')).toBe('밴드');
    expect(normalizeTag('#\uFE0E#\uFE0F밴드')).toBe('밴드');
  });

  it('지운 문자 사이에 끼어 있던 분해된 한글도 합쳐진다', () => {
    expect(normalizeTag('\u1100\u1160\u1161')).toBe('가');
    expect(normalizeTag('\u1100\u200B\u1161')).toBe('가');
  });

  it('공백처럼 보이는 한글 채움 문자·점자 공백은 지운다', () => {
    expect(normalizeTag('\u3164')).toBe('');
    expect(normalizeTag('농\u3164구')).toBe('농구');
    expect(normalizeTag('\u2800\u115F\u1160\uFFA0')).toBe('');
  });

  it('이모지 조합에 쓰는 ZWJ 는 지우지 않는다', () => {
    expect(normalizeTag('코딩👨\u200D💻')).toBe('코딩👨\u200D💻');
  });

  it('보이는 글자가 하나도 없는 태그는 버린다 — 빈 칩으로 보인다', () => {
    expect(normalizeTag('\u200D')).toBe('');
    expect(normalizeTag('\u200C\u200D')).toBe('');
    expect(normalizeTag('\uFE0F')).toBe('');
    expect(normalizeTag('\u034F')).toBe('');
    expect(normalizeTag('\u20E3')).toBe('');
  });
});

describe('appendTag', () => {
  it('같아 보이는 태그는 이미 있는 태그로 보고 넣지 않는다', () => {
    const tags = ['축구'];

    expect(appendTag(tags, '축\u200B구', { maxTags: 5, maxTagLength: 5 })).toBe(tags);
  });

  it('예전에 # 를 붙여 저장한 태그와도 중복을 판정한다', () => {
    const tags = ['#밴드'];

    expect(appendTag(tags, '밴드', { maxTags: 5, maxTagLength: 5 })).toBe(tags);
  });

  it('# 만 다른 태그는 이미 있는 태그로 본다', () => {
    const tags = ['축구'];

    expect(appendTag(tags, '#축구', { maxTags: 5, maxTagLength: 5 })).toBe(tags);
  });
});

describe('tagLabel', () => {
  it('태그 앞에 # 를 하나만 붙인다 — 예전에 # 를 붙여 저장한 태그도 ## 로 보이지 않는다', () => {
    expect(tagLabel('밴드')).toBe('#밴드');
    expect(tagLabel('#밴드')).toBe('#밴드');
    expect(tagLabel('##밴드')).toBe('#밴드');
    expect(tagLabel('# 밴드')).toBe('#밴드');
    expect(tagLabel('# #밴드')).toBe('#밴드');
  });
});
