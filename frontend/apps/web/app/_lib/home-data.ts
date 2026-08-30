import { createApiClient } from '@duing/api';
import type { ClubSummary } from '@duing/types';
import {
  FALLBACK_BANNERS,
  fallbackBannerToSlide,
  promotionToSlide,
  type CarouselSlide,
} from './promotion';
import { resolveApiBaseUrl } from './apiBaseUrl';
import { shouldRethrowBackendFailure } from './fail-soft';

const apiBaseUrl = resolveApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL,
  process.env.NODE_ENV,
);

function client() {
  return createApiClient({
    baseUrl: apiBaseUrl,
  });
}

// 빌드 국면·development 한정 폴백 — 백엔드 미가동에도 홈을 500 없이 렌더한다.
// production 런타임(=ISR 재생성 경로)에서는 swallow 하지 않고 rethrow 한다. 근거는 fail-soft.ts 참조.
function logBackendUnavailable(scope: string, error: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[home-data] ${scope} 백엔드 호출 실패 — 빈 결과로 폴백`, error);
  }
}

/**
 * 신규 슬롯 판정 창(일) — 이 기간 안에 모집을 시작한 동아리를 "신규" 로 본다.
 * 동아리 생성일 대신 모집 시작일을 쓰는 이유는, 학생이 지금 지원할 수 있는 곳이라야 발견의 의미가
 * 있어서다(오래 전 만들어졌지만 이번 학기에 처음 모집하는 동아리도 여기 포함된다).
 */
const NEW_CLUB_WINDOW_DAYS = 30;

/** 관심도 상위 후보를 넉넉히 받아 신규 슬롯 후보까지 한 번의 요청으로 해결한다. */
const INTEREST_CANDIDATE_SIZE = 12;

function isNewlyRecruiting(club: ClubSummary, today: Date): boolean {
  const recruitment = club.activeRecruitment;
  if (!recruitment) return false;
  // 시작일만 보면 이미 끝난 단기 모집도 30일간 "신규" 로 잡혀, 마감 배지를 단 카드가 슬롯을 차지한다.
  // 이 슬롯의 목적은 "지금 지원할 수 있는 새 동아리" 를 보이게 하는 것이라 열린 모집만 인정한다.
  if (recruitment.displayStatus !== 'OPEN' && recruitment.displayStatus !== 'ALWAYS_OPEN') {
    return false;
  }
  // 날짜는 KST 자정 기준으로 읽는다 — 서버(Vercel)는 UTC 라 존을 붙이지 않으면 경계가 9시간 밀린다.
  const started = new Date(`${recruitment.startDate}T00:00:00+09:00`);
  if (Number.isNaN(started.getTime())) return false;
  const elapsedDays = (today.getTime() - started.getTime()) / 86_400_000;
  return elapsedDays >= 0 && elapsedDays <= NEW_CLUB_WINDOW_DAYS;
}

/**
 * InterestingClubs 용: 최근 7일 조회 기반 관심도순 상위 size 곳.
 *
 * <p>여기에 신규 슬롯 규칙이 하나 얹힌다 — 상위 목록에 최근 모집을 시작한 동아리가 하나도 없으면
 * 마지막 칸을 후보 중 가장 최근에 모집을 시작한 곳으로 바꾼다. 관심도 점수 자체에 신규 가산점을
 * 곱하지 않는 이유는, 그렇게 하면 실제로 아무도 보지 않은 동아리가 점수만으로 상단에 올라오기
 * 때문이다. 슬롯 방식은 최대 한 칸만 양보하므로 나머지 순위를 왜곡하지 않는다.
 *
 * <p>후보를 넉넉히(12곳) 한 번에 받아 신규 후보까지 같은 응답에서 고른다 — 신규 조회를 따로
 * 던지면 홈이 재생성될 때마다 왕복이 하나 더 늘어난다.
 */
export async function fetchInterestingClubs(size: number): Promise<ClubSummary[]> {
  try {
    const page = await client().clubs.list({
      sort: 'INTEREST',
      size: Math.max(size, INTEREST_CANDIDATE_SIZE),
    });
    return applyNewClubSlot(page.content, size, new Date());
  } catch (error) {
    if (shouldRethrowBackendFailure()) throw error;
    logBackendUnavailable('fetchInterestingClubs', error);
    return [];
  }
}

/** 테스트용 export — 런타임에선 fetchInterestingClubs 가 호출한다. */
export function applyNewClubSlot(
  candidates: ClubSummary[],
  size: number,
  today: Date,
): ClubSummary[] {
  const top = candidates.slice(0, size);
  // 이미 신규가 섞여 있으면 양보할 이유가 없다 — 관심도 순서를 그대로 둔다.
  if (top.length < size || top.some((club) => isNewlyRecruiting(club, today))) {
    return top;
  }
  const newcomer = candidates.slice(size).find((club) => isNewlyRecruiting(club, today));
  if (!newcomer) return top;
  // 마지막 칸만 내준다 — 상위 순위는 건드리지 않는다.
  return [...top.slice(0, size - 1), newcomer];
}

/** RecruitmentTicker 용: 마감 임박순 모집 중 동아리, 상시모집(endDate=null) 은 제거. */
export async function fetchUpcomingDeadlineClubs(size: number): Promise<ClubSummary[]> {
  try {
    const page = await client().clubs.list({
      sort: 'DEADLINE_SOON',
      recruitmentStatus: 'AVAILABLE',
      size,
    });
    return page.content.filter((club) => club.activeRecruitment?.endDate != null);
  } catch (error) {
    if (shouldRethrowBackendFailure()) throw error;
    logBackendUnavailable('fetchUpcomingDeadlineClubs', error);
    return [];
  }
}

/**
 * BannerCarousel 용: 공개 활성 프로모션 슬라이드.
 * DB 가 비어 0건이면(정상 응답) 정적 폴백 배너를 반환해 홈 레이아웃 깨짐을 방지한다.
 * 백엔드 장애는 위 로더들과 같은 정책 — 빌드·dev 만 폴백 배너, 런타임은 rethrow.
 */
export async function fetchPublicPromotionSlides(): Promise<CarouselSlide[]> {
  try {
    const page = await client().promotions.list();
    if (page.content.length > 0) {
      return page.content.map(promotionToSlide);
    }
  } catch (error) {
    if (shouldRethrowBackendFailure()) throw error;
    logBackendUnavailable('fetchPublicPromotionSlides', error);
  }
  return FALLBACK_BANNERS.map(fallbackBannerToSlide);
}
