// Global role (시스템 전역). Club-scoped role 은 ClubMemberRole 참조.
export type UserRole = 'STUDENT' | 'ADMIN';

export type Grade = 'FRESHMAN' | 'SOPHOMORE' | 'JUNIOR' | 'SENIOR' | 'GRADUATE_DEFERRED';

export const GRADE_DISPLAY_NAME: Record<Grade, string> = {
  FRESHMAN: '1학년',
  SOPHOMORE: '2학년',
  JUNIOR: '3학년',
  SENIOR: '4학년',
  GRADUATE_DEFERRED: '졸업유예',
};

export const GRADE_OPTIONS: ReadonlyArray<Grade> = [
  'FRESHMAN',
  'SOPHOMORE',
  'JUNIOR',
  'SENIOR',
  'GRADUATE_DEFERRED',
];

export type College =
  | 'PUBLIC_LEADERS'
  | 'GLOBAL_BUSINESS'
  | 'SOCIAL_SCIENCE'
  | 'HEALTH_BIO'
  | 'IT_ENGINEERING'
  | 'DESIGN_ART'
  | 'EDUCATION'
  | 'REHABILITATION'
  | 'NURSING'
  | 'GLOCAL_LIFE'
  | 'INTERNATIONAL'
  | 'SPORTS_LEISURE'
  | 'CULTURE_CONTENTS'
  | 'FREE_MAJOR';

export const COLLEGE_DISPLAY_NAME: Record<College, string> = {
  PUBLIC_LEADERS: '공공인재대학',
  GLOBAL_BUSINESS: '글로벌경영대학',
  SOCIAL_SCIENCE: '사회과학대학',
  HEALTH_BIO: '보건바이오대학',
  IT_ENGINEERING: 'IT·공과대학',
  DESIGN_ART: '디자인예술대학',
  EDUCATION: '사범대학',
  REHABILITATION: '재활과학대학',
  NURSING: '간호대학',
  GLOCAL_LIFE: '글로컬라이프대학',
  INTERNATIONAL: '국제대학',
  SPORTS_LEISURE: '체육레저학부',
  CULTURE_CONTENTS: '문화콘텐츠학부',
  FREE_MAJOR: '자유전공학부',
};

export const COLLEGE_OPTIONS: ReadonlyArray<College> = [
  'PUBLIC_LEADERS',
  'GLOBAL_BUSINESS',
  'SOCIAL_SCIENCE',
  'HEALTH_BIO',
  'IT_ENGINEERING',
  'DESIGN_ART',
  'EDUCATION',
  'REHABILITATION',
  'NURSING',
  'GLOCAL_LIFE',
  'INTERNATIONAL',
  'SPORTS_LEISURE',
  'CULTURE_CONTENTS',
  'FREE_MAJOR',
];

export type User = {
  id: number;
  studentId: string;
  name: string;
  email: string;
  role: UserRole;
};

export type SignupPayload = {
  studentId: string;
  name: string;
  email: string;
  password: string;
  grade: Grade;
  college: College;
  major: string;
  phone: string;
  termsOfServiceAgreed: boolean;
  privacyPolicyAgreed: boolean;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type LoginResult = {
  accessToken: string;
  tokenType: 'Bearer';
  user: User;
};