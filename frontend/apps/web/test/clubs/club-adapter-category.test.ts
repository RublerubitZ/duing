import { describe, expect, it } from 'vitest';
import type { ClubCategory, ClubSummary } from '@duing/types';

import { homeCategoryOf } from '../../app/_lib/homeCategories';
import { clubCategoryLabel } from '../../app/clubs/[clubId]/_lib/clubCategoryLabel';
import { summaryToClub } from '../../app/clubs/_lib/clubAdapter';
import { CAT_COLORS } from '../../app/clubs/_lib/clubs';
import { ALL_CLUB_CATEGORIES } from '../shared/clubCategories';

const summary: ClubSummary = {
  id: 7,
  name: '두잉',
  category: 'ACADEMIC',
  division: null,
  college: null,
  department: null,
  logoUrl: null,
  logoThumbnailUrl: null,
  status: 'ACTIVE',
  tags: [],
  tagline: null,
  centralClub: true,
  activeRecruitment: null,
};

// 예술(#781)·종교·취미·기타는 홈 분류 표의 라벨색을 그대로 쓴다 — 흰 바탕 대비는 home-categories 테스트가 지킨다.
const HOME_COLOR_CATEGORIES: ClubCategory[] = ['ART', 'RELIGION', 'HOBBY', 'OTHER'];

const UNKNOWN_CATEGORY = 'NEW_CATEGORY' as unknown as ClubCategory;

describe('summaryToClub — 탐색 카드 분류 표기', () => {
  it.each(ALL_CLUB_CATEGORIES)('%s 는 상세·찜과 같은 글자로 표시한다', (category) => {
    expect(summaryToClub({ ...summary, category }).cat).toBe(clubCategoryLabel(category));
  });

  it('백엔드가 먼저 배포한 모르는 분류 값은 상세와 같은 "기타"로 표시한다', () => {
    const club = summaryToClub({ ...summary, category: UNKNOWN_CATEGORY });

    expect(club.cat).toBe('기타');
    expect(club.cat).toBe(clubCategoryLabel(UNKNOWN_CATEGORY));
  });

  it.each(HOME_COLOR_CATEGORIES)('%s 의 글자색은 홈 분류 라벨색과 같다', (category) => {
    const club = summaryToClub({ ...summary, category });

    expect(CAT_COLORS[club.cat].text.toLowerCase()).toBe(
      `text-[${homeCategoryOf(category).labelColor.toLowerCase()}]`,
    );
  });
});
