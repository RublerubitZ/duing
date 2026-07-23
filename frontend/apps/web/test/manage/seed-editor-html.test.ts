import { describe, expect, it } from 'vitest';

import { seedEditorHtml } from '../../app/manage/clubs/[clubId]/info/_lib/seedEditorHtml';

describe('seedEditorHtml — 편집 진입 시 소개글 에디터 시드', () => {
  it('빈 문자열/공백만 있으면 빈 문자열을 돌려준다', () => {
    expect(seedEditorHtml('')).toBe('');
    expect(seedEditorHtml('   \n  ')).toBe('');
  });

  it('이미 HTML(< 로 시작)이면 그대로 통과시킨다', () => {
    const html = '<p>안녕하세요</p><p>코딩 동아리입니다</p>';
    expect(seedEditorHtml(html)).toBe(html);
    // 선행 공백이 있어도 HTML 로 인식한다
    expect(seedEditorHtml('  <p>x</p>')).toBe('  <p>x</p>');
  });

  it('plain 단일 문단은 <p> 로 감싼다', () => {
    expect(seedEditorHtml('우리는 매주 모여요')).toBe('<p>우리는 매주 모여요</p>');
  });

  it('빈 줄로 나뉜 문단은 각각 <p> 로 변환한다', () => {
    expect(seedEditorHtml('첫 문단\n\n둘째 문단')).toBe('<p>첫 문단</p><p>둘째 문단</p>');
  });

  it('문단 안의 단일 개행은 <br> 로 보존한다(개행 소실 방지)', () => {
    expect(seedEditorHtml('첫 줄\n둘째 줄')).toBe('<p>첫 줄<br>둘째 줄</p>');
  });

  it('HTML 특수문자(< > &)를 이스케이프해 데이터 손실을 막는다', () => {
    // "<신입 모집>" 처럼 < 로 시작하는 plain 은 HTML 로 오인되므로 이 케이스는 escape 대상이 아니다.
    // 문단 중간의 특수문자만 검증한다.
    expect(seedEditorHtml('가격 < 100원 & 무료')).toBe('<p>가격 &lt; 100원 &amp; 무료</p>');
  });
});
