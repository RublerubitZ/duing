import { describe, expect, it } from 'vitest';
import { adminUpdateClubSchema, updateClubSchema } from '@duing/schemas';

const base = {
  description: null, logoUrl: null, coverUrl: null,
  tags: [], snsLinks: [], faqs: [],
  foundedYear: null, cohortNumber: null, location: null,
  activityFrequency: null, activeDays: [], tagline: null, highlights: [],
  contactVisibility: 'PUBLIC', feeCycle: 'NONE', membershipFeeAmount: null, projects: [],
};

describe('updateClubSchema (리더)', () => {
  it('회비 없음(NONE)+금액 null 조합을 허용한다', () => {
    expect(updateClubSchema.safeParse(base).success).toBe(true);
  });
  it('NONE 인데 금액이 있으면 거부한다', () => {
    expect(updateClubSchema.safeParse({ ...base, membershipFeeAmount: 30000 }).success).toBe(false);
  });
  it('유료 주기인데 금액이 없으면 거부한다', () => {
    expect(updateClubSchema.safeParse({ ...base, feeCycle: 'SEMESTER' }).success).toBe(false);
  });
  it('기타 SNS 는 label 이 없으면 거부한다', () => {
    const link = { platform: 'OTHER', label: null, url: 'https://github.com/doing' };
    expect(updateClubSchema.safeParse({ ...base, snsLinks: [link] }).success).toBe(false);
  });
  it('기본 플랫폼은 label 없이 허용한다', () => {
    const link = { platform: 'KAKAO', label: null, url: 'https://open.kakao.com/x' };
    expect(updateClubSchema.safeParse({ ...base, snsLinks: [link] }).success).toBe(true);
  });
  it('프로젝트 7개는 거부한다 (최대 6)', () => {
    const project = { icon: 'CODE', title: '프로젝트', subtitle: null };
    expect(updateClubSchema.safeParse({ ...base, projects: Array(7).fill(project) }).success).toBe(false);
  });
  it('허용 목록 밖 아이콘은 거부한다', () => {
    const project = { icon: 'EMOJI', title: '프로젝트', subtitle: null };
    expect(updateClubSchema.safeParse({ ...base, projects: [project] }).success).toBe(false);
  });
  it('강조 항목 10개까지는 백스톱으로 허용한다 (FE 추가 제한과 별개, §4.4)', () => {
    expect(updateClubSchema.safeParse({ ...base, highlights: Array(10).fill('항목') }).success).toBe(true);
  });
});

describe('adminUpdateClubSchema (총동연)', () => {
  it('잠금 필드(name/category/division)를 포함해 검증한다', () => {
    const admin = { ...base, name: '두잉코드', category: 'ACADEMIC', division: null };
    expect(adminUpdateClubSchema.safeParse(admin).success).toBe(true);
  });
});
