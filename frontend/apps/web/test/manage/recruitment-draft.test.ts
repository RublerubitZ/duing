import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRecruitmentDraft,
  loadRecruitmentDraft,
  saveRecruitmentDraft,
} from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentDraft';

describe('recruitmentDraft', () => {
  const owner = { userId: 1, clubId: 7 };
  const storageKey = 'duing:recruitment-draft:1:7';

  beforeEach(() => window.localStorage.clear());

  it('저장·복원·삭제', () => {
    saveRecruitmentDraft(owner, { title: '가을 모집', capacity: 10 });
    const loaded = loadRecruitmentDraft(owner);
    expect(loaded?.values.title).toBe('가을 모집');
    expect(typeof loaded?.savedAt).toBe('number');
    clearRecruitmentDraft(owner);
    expect(loadRecruitmentDraft(owner)).toBeNull();
  });

  // 세션이 끊긴 기기에서 같은 동아리의 다른 운영진이 로그인해도 남의 초안 배너가 뜨면 안 된다.
  it('같은 동아리라도 다른 사용자가 저장한 초안은 로드되지 않는다', () => {
    saveRecruitmentDraft(owner, { title: '이전 운영진이 쓰던 제목' });

    expect(loadRecruitmentDraft({ userId: 2, clubId: 7 })).toBeNull();
    expect(loadRecruitmentDraft(owner)?.values.title).toBe('이전 운영진이 쓰던 제목');
  });

  it('손상된 값은 null', () => {
    window.localStorage.setItem(storageKey, '{not json');
    expect(loadRecruitmentDraft(owner)).toBeNull();
  });

  // 키만 있으면 통과시키면 배너가 "NaN분 전" 을 띄우고 "이어서 쓰기" 에서 터진다.
  it('키는 있어도 형태가 어긋나면 null', () => {
    const setDraft = (value: unknown) =>
      window.localStorage.setItem(storageKey, JSON.stringify(value));

    setDraft({ values: null, savedAt: 'x' });
    expect(loadRecruitmentDraft(owner)).toBeNull();

    setDraft({ values: { title: '제목' }, savedAt: 'x' });
    expect(loadRecruitmentDraft(owner)).toBeNull();

    setDraft({ values: '제목', savedAt: Date.now() });
    expect(loadRecruitmentDraft(owner)).toBeNull();
  });
});
