import { describe, expect, it } from 'vitest';
import type { ClubDetail } from '@duing/types';

import { isAdEligibleClub, MIN_AD_TEXT_LENGTH } from '@/app/clubs/[clubId]/_lib/adEligibility';

import { clubDetail } from './club-detail-tree-fixture';

// 판정이 세는 세 필드를 비운 기준 동아리 — 케이스마다 한 필드만 채워 합산을 본다(Q&A·사진은 픽스처 값 그대로 둔다).
function emptyClub(overrides: Partial<ClubDetail> = {}): ClubDetail {
  return { ...clubDetail, description: null, highlights: [], projects: [], ...overrides };
}

const text = (length: number) => '가'.repeat(length);

describe('isAdEligibleClub — 서버가 그리는 기본 탭 글이 충분한 동아리 상세', () => {
  it('기준은 공백 제외 300자다', () => {
    expect(MIN_AD_TEXT_LENGTH).toBe(300);
  });

  it('소개 299자면 광고 대상이 아니고 300자면 대상이다', () => {
    expect(isAdEligibleClub(emptyClub({ description: text(299) }))).toBe(false);
    expect(isAdEligibleClub(emptyClub({ description: text(300) }))).toBe(true);
  });

  it('공백·줄바꿈은 세지 않는다', () => {
    expect(isAdEligibleClub(emptyClub({ description: `${text(150)} \n\t ${text(149)}` }))).toBe(false);
  });

  it('Tiptap HTML 소개는 태그를 빼고 글자만 센다', () => {
    expect(isAdEligibleClub(emptyClub({ description: `<p>${text(299)}</p><p></p>` }))).toBe(false);
    expect(isAdEligibleClub(emptyClub({ description: `<p>${text(150)}</p><p>${text(150)}</p>` }))).toBe(true);
  });

  it('HTML 의 &nbsp; 는 공백이라 세지 않는다', () => {
    expect(isAdEligibleClub(emptyClub({ description: `<p>${text(299)}&nbsp;&nbsp;</p>` }))).toBe(false);
  });

  it('< 로 시작하는 레거시 평문 소개는 글자를 버리지 않는다', () => {
    // 블록 마크업이 없으면 평문으로 본다 — '<신입부원 모집>' 은 태그가 아니다(공백 제외 8자).
    expect(isAdEligibleClub(emptyClub({ description: `<신입부원 모집> ${text(292)}` }))).toBe(true);
    expect(isAdEligibleClub(emptyClub({ description: `<신입부원 모집> ${text(291)}` }))).toBe(false);
  });

  it('소개·하이라이트·활동(제목·부제)을 합산한다', () => {
    const club = emptyClub({
      description: text(100),
      highlights: [text(50), text(50)],
      projects: [{ icon: 'DUMBBELL', title: text(60), subtitle: text(40) }],
    });
    expect(isAdEligibleClub(club)).toBe(true);
  });

  it('활동 부제·소개가 null 이면 0으로 센다', () => {
    // null 을 글자('null' 4자)로 세면 296 + 4 = 300 이 돼 대상이 된다 — 0 으로 세야 대상이 아니다.
    const club = emptyClub({ description: null, projects: [{ icon: 'DUMBBELL', title: text(296), subtitle: null }] });
    expect(isAdEligibleClub(club)).toBe(false);
  });

  // 서버 HTML(크롤러가 받는 초기 문서)에 없는 콘텐츠 — Q&A 는 고르지 않은 탭, 활동 사진은 클라이언트 조회다.
  it('Q&A·활동 사진·한 줄 소개는 아무리 많아도 세지 않는다', () => {
    const photo = clubDetail.photos[0];
    expect(photo).toBeDefined();
    if (!photo) return;
    const club = emptyClub({
      description: '축구 동아리입니다.',
      tagline: text(400),
      faqs: [{ question: text(200), answer: text(200), order: 0 }],
      photos: Array.from({ length: 10 }, (_, index) => ({ ...photo, id: index + 1, caption: text(40), displayOrder: index })),
    });
    expect(isAdEligibleClub(club)).toBe(false);
  });
});
