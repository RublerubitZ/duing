import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRecruitmentDraft,
  loadRecruitmentDraft,
  saveRecruitmentDraft,
} from '@/app/manage/clubs/[clubId]/recruitments/_lib/recruitmentDraft';

describe('recruitmentDraft', () => {
  beforeEach(() => window.localStorage.clear());

  it('저장·복원·삭제', () => {
    saveRecruitmentDraft(7, { title: '가을 모집', capacity: 10 });
    const loaded = loadRecruitmentDraft(7);
    expect(loaded?.values.title).toBe('가을 모집');
    expect(typeof loaded?.savedAt).toBe('number');
    clearRecruitmentDraft(7);
    expect(loadRecruitmentDraft(7)).toBeNull();
  });

  it('손상된 값은 null', () => {
    window.localStorage.setItem('duing:recruitment-draft:7', '{not json');
    expect(loadRecruitmentDraft(7)).toBeNull();
  });

  // 키만 있으면 통과시키면 배너가 "NaN분 전" 을 띄우고 "이어서 쓰기" 에서 터진다.
  it('키는 있어도 형태가 어긋나면 null', () => {
    const setDraft = (value: unknown) =>
      window.localStorage.setItem('duing:recruitment-draft:7', JSON.stringify(value));

    setDraft({ values: null, savedAt: 'x' });
    expect(loadRecruitmentDraft(7)).toBeNull();

    setDraft({ values: { title: '제목' }, savedAt: 'x' });
    expect(loadRecruitmentDraft(7)).toBeNull();

    setDraft({ values: '제목', savedAt: Date.now() });
    expect(loadRecruitmentDraft(7)).toBeNull();
  });
});
