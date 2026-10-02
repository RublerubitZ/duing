/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';

import { htmlToPlainText, splitPlainText } from '../../app/_lib/htmlToPlainText';
import { descriptionToPlainText } from '../../app/clubs/[clubId]/_lib/descriptionText';

// 서버 렌더·하이드레이션 첫 프레임에서 HTML 본문을 텍스트로 보여 줄 때 쓴다 — DOM 이 없는 node 환경에서 돈다.
describe('htmlToPlainText', () => {
  it('블록 끝은 빈 줄, <br> 과 </li> 는 줄바꿈 하나로 바꾸고 태그를 걷어낸다', () => {
    expect(htmlToPlainText('<h2>소개</h2><p>함께 <strong>운동</strong>해요<br>매주 화요일</p>')).toBe(
      '소개\n\n함께 운동해요\n매주 화요일',
    );
    expect(htmlToPlainText('<ul><li>스트레칭</li><li>테이핑</li></ul><p>끝</p>')).toBe('스트레칭\n테이핑\n\n끝');
  });

  it('script·style 블록과 주석은 내용째 지운다', () => {
    expect(htmlToPlainText('<!-- 메모 --><script>alert(1)</script><style>p{}</style><p>본문</p>')).toBe('본문');
  });

  it('엔티티는 한 번만 해제한다 — 이중 인코딩은 한 겹만 벗긴다', () => {
    expect(htmlToPlainText('<p>&lt;신입 모집&gt; &amp;amp; &quot;환영&quot; &#39;Q&#39;&nbsp;끝</p>')).toBe(
      '<신입 모집> &amp; "환영" \'Q\' 끝',
    );
    expect(htmlToPlainText('<p>&#65;&#x1F600; &unknown;</p>')).toBe('A😀 &unknown;');
  });

  it('이름 참조는 표에 직접 있는 키만 — &constructor; 같은 Object.prototype 키는 원문 그대로 둔다', () => {
    expect(htmlToPlainText('<p>&constructor; 모집</p>')).toBe('&constructor; 모집');
  });

  it('숫자 참조가 서로게이트·0·U+10FFFF 초과면 브라우저 HTML 파서처럼 U+FFFD 로 바꾼다', () => {
    expect(htmlToPlainText('<p>a&#xD800;b&#0;c&#x110000;d</p>')).toBe('a\uFFFDb\uFFFDc\uFFFDd');
  });

  it('< 바로 뒤가 ASCII 글자가 아니면 태그로 보지 않는다 — 레거시 평문 보존', () => {
    expect(htmlToPlainText('<신입부원 모집>\n\n본문')).toBe('<신입부원 모집>\n\n본문');
    expect(htmlToPlainText('3 < 5 이고 7 > 2')).toBe('3 < 5 이고 7 > 2');
  });

  it('빈 줄은 2개까지로 줄이고 앞뒤 공백을 지운다', () => {
    expect(htmlToPlainText('  <p>a</p><p></p><p></p><p>b</p>  ')).toBe('a\n\nb');
  });

  it('Tiptap 목록(<li><p>…</p></li>)은 항목 사이를 줄바꿈 하나로 둬 목록 전체가 한 문단이 된다', () => {
    expect(htmlToPlainText('<ul><li><p>스트레칭</p></li><li><p>테이핑</p></li></ul><p>끝</p>')).toBe(
      '스트레칭\n테이핑\n\n끝',
    );
  });

  it('입력은 앞 20,000자까지만 처리한다 — 길이 제한 없는 본문이 서버 렌더 시간을 잡아먹지 않게', () => {
    expect(htmlToPlainText(`<p>${'가'.repeat(30_000)}</p>`).length).toBeLessThanOrEqual(20_000);
  });

  it('상한 경계가 서로게이트 쌍 가운데면 한 글자 앞에서 잘라 짝 없는 서로게이트를 남기지 않는다', () => {
    expect(htmlToPlainText(`${'가'.repeat(20_000 - 1)}😀끝`)).not.toMatch(/[\uD800-\uDBFF]$/);
  });
});

describe('splitPlainText', () => {
  it('빈 줄(사이 공백 허용)로 첫 문단과 나머지를 나눈다', () => {
    expect(splitPlainText('첫 문단\n\n둘째\n \n셋째')).toEqual({ lead: '첫 문단', rest: '둘째\n\n셋째' });
  });

  it('나머지가 없으면 rest 는 null', () => {
    expect(splitPlainText('한 문단뿐')).toEqual({ lead: '한 문단뿐', rest: null });
  });
});

describe('descriptionToPlainText', () => {
  it('Tiptap HTML 은 태그를 걷어낸 텍스트로 바꾼다', () => {
    expect(descriptionToPlainText('<p>함께 <strong>운동</strong>해요</p>')).toBe('함께 운동해요');
  });

  it('블록 마크업이 없거나 < 로 시작하지 않으면 원문 그대로 둔다 — 하이드레이션 뒤 평문 폴백과 같은 텍스트', () => {
    expect(descriptionToPlainText('<AI 스터디> 소개\n\n본문')).toBe('<AI 스터디> 소개\n\n본문');
    expect(descriptionToPlainText('<공지> R&amp;D')).toBe('<공지> R&amp;D');
    expect(descriptionToPlainText('평문 <p>태그</p>')).toBe('평문 <p>태그</p>');
  });
});
