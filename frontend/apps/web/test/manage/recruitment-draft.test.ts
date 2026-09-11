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
});
