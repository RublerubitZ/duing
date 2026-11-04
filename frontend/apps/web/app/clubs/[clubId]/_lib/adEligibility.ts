import type { ClubDetail } from '@duing/types';

import { descriptionToPlainText } from './descriptionText';

/** 광고를 실을 동아리 상세의 최소 글자 수(공백 제외) — 서버가 기본 탭에 그리는 소개·하이라이트·활동의 합이다. */
export const MIN_AD_TEXT_LENGTH = 300;

const countNonWhitespace = (text: string | null): number => (text ?? '').replace(/\s/g, '').length;

/**
 * 동아리 상세에 광고를 실을 만한 게시자 콘텐츠가 크롤러가 받는 초기 HTML 에 있는지 — 서버가 기본 탭에 그리는 동아리 글
 * (소개 평문·하이라이트·활동 제목·부제)이 공백 제외 300자 이상이면 그렇다.
 *
 * <p>애드센스는 가치가 낮은 화면의 광고를 금지한다 — 소개 한 줄과 공통 문구("현재 모집이 없어요" 등)뿐인 상세에는 싣지 않는다.
 * Q&A 는 고르지 않은 탭이라, 활동 사진은 클라이언트 조회라 서버 HTML 에 없어서 세지 않는다. 대표 활동은 조회 실패 시 null 이라
 * 판정이 재생성 주기 동안 흔들려서 세지 않는다(빼면 광고를 덜 싣는 쪽으로만 틀린다). 한 줄 소개(tagline)도 세지 않는다.
 * DOM 없이 동작해 서버 컴포넌트(page.tsx)에서 쓴다. 동아리가 글을 보강하면 공개 정보 변경 트리거로 상세가 다시 만들어질 때 대상이 된다.
 */
export function isAdEligibleClub(club: ClubDetail): boolean {
  const descriptionLength =
    club.description === null ? 0 : countNonWhitespace(descriptionToPlainText(club.description));
  const highlightLength = club.highlights.reduce((sum, highlight) => sum + countNonWhitespace(highlight), 0);
  const projectLength = club.projects.reduce(
    (sum, project) => sum + countNonWhitespace(project.title) + countNonWhitespace(project.subtitle),
    0,
  );
  return descriptionLength + highlightLength + projectLength >= MIN_AD_TEXT_LENGTH;
}
