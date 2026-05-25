import type { College } from '@duing/types';

export const COLLEGE_OPTIONS: { code: College; label: string }[] = [
  { code: 'PUBLIC_LEADERS', label: '공공인재대학' },
  { code: 'GLOBAL_BUSINESS', label: '글로벌경영대학' },
  { code: 'SOCIAL_SCIENCE', label: '사회과학대학' },
  { code: 'HEALTH_BIO', label: '보건바이오대학' },
  { code: 'IT_ENGINEERING', label: 'IT·공과대학' },
  { code: 'DESIGN_ART', label: '디자인예술대학' },
  { code: 'EDUCATION', label: '사범대학' },
  { code: 'REHABILITATION', label: '재활과학대학' },
  { code: 'NURSING', label: '간호대학' },
  { code: 'GLOCAL_LIFE', label: '글로컬라이프대학' },
  { code: 'INTERNATIONAL', label: '국제대학' },
  { code: 'SPORTS_LEISURE', label: '체육레저학부' },
  { code: 'CULTURE_CONTENTS', label: '문화콘텐츠학부' },
  { code: 'FREE_MAJOR', label: '자유전공학부' },
];

const labelByCode = new Map(COLLEGE_OPTIONS.map((option) => [option.code, option.label]));

export function collegeDisplayName(code: College): string {
  return labelByCode.get(code) ?? code;
}
