/* ============================================================
   지원현황 — 타입 정의 + 상수 + 목업 데이터
   (a-apply-status.jsx 의 1번 섹션을 TypeScript 로 변환)
   ============================================================ */

import { APPLICATION_STATUS_APPLICANT_LABEL } from '@/app/_constants/application-status';

export const PAGE_MAX = 900;
export const PAGE_PAD = '28px';

/* steps state */
export type StepState = 'done' | 'current' | 'pending' | 'failed';

export type Step = {
  label: string;
  date: string;
  state: StepState;
};

export type AppFile = {
  type: string;
  name: string;
};

export type Logo = {
  kind: 'wordmark' | 'mountain' | 'alpha' | 'stack' | 'img';
  text?: string;
  lines?: string[];
  url?: string;
  bg: string;
  fg: string;
};

export type AppRight = {
  eyebrow: string;
  value: string;
  sub?: string;
};

export type AppStatus =
  | 'interview-scheduled'
  | 'interview-pending'
  | 'passed'
  | 'failed'
  | 'applied';

export type App = {
  id: string;
  name: string;
  cat: string;
  tag: string;
  appliedDate: string;
  appliedAt: string;
  division: string;
  department: string;
  files: AppFile[];
  memo: string;
  steps: Step[];
  status: AppStatus;
  right: AppRight | null;
  logo: Logo;
};

export type StatusMetaEntry = {
  label: string;
  pill: string;
  textColor: string;
  bg: string;
};

export type FilterKey = 'all' | 'doc' | 'intv' | 'pass' | 'fail';

export type Filter = {
  key: FilterKey;
  label: string;
};

export type Counts = Record<string, number>;

/* ============================================================
   STATUS_META
   지원자 대면 상태 표기 SoT = APPLICATION_STATUS_APPLICANT_LABEL (스펙 §5-4).
   AppStatus 는 ApplicationStatus 의 파생 키라 SoT 를 그대로 색인할 수 없어
   대응하는 enum 값을 골라 소비한다.
   ============================================================ */
export const STATUS_META: Record<string, StatusMetaEntry> = {
  // INTERVIEW_PENDING 의 sub-state(면접 일정 배정 완료) — SoT 에 대응 enum 이 없어
  // '면접 대상' 다음 단계임이 드러나는 표기를 쓴다. 같은 카드의 '면접일' 표기와 짝.
  'interview-scheduled': { label: '면접일 확정',                                        pill: 'coral', textColor: '#9A3F23', bg: '#FCE2D9' },
  'interview-pending':   { label: APPLICATION_STATUS_APPLICANT_LABEL.INTERVIEW_PENDING, pill: 'sky',   textColor: '#2F557A', bg: '#DDE8F1' },
  'passed':              { label: APPLICATION_STATUS_APPLICANT_LABEL.ACCEPTED,          pill: 'sage',  textColor: '#1F4A36', bg: '#D5E5D7' },
  'failed':              { label: APPLICATION_STATUS_APPLICANT_LABEL.REJECTED,          pill: 'fail',  textColor: '#9A3F23', bg: '#FCE2D9' },
  // SUBMITTED·ON_HOLD 는 지원자에게 같은 표기라 어느 쪽을 참조해도 동일하다 (스펙 §1-1).
  'applied':             { label: APPLICATION_STATUS_APPLICANT_LABEL.SUBMITTED,         pill: 'muted', textColor: '#4A504F', bg: '#EDEAE0' },
};



/* status → filter key 매핑 — 키 이름은 내부 식별자다(표기와 무관, 'doc' 은 초기 명명 잔재) */
export const STATUS_TO_FILTER: Record<string, FilterKey | undefined> = {
  'interview-scheduled': 'intv',
  'interview-pending':   'intv',
  'passed':              'pass',
  'failed':              'fail',
  'applied':             'doc',
};

/* 카테고리 → 작은 라벨 색상 */
export const CAT_LABEL_COLOR: Record<string, string> = {
  '학술': '#5C8268',
  '봉사': '#5C8268',
  '예술': '#5C8268',
  '연합': '#5C8268',
  '환경': '#5C8268',
  'IT':   '#5C8268',
};

/* 통합 필터 — 상단 pill 탭과 우측 체크박스 모두 동일하게 사용.
   탭 라벨도 지원자 대면 표기라 SoT 를 따른다 (매칭 로직은 STATUS_TO_FILTER 가 담당). */
export const FILTERS: Filter[] = [
  { key: 'all',  label: '전체' },
  { key: 'doc',  label: APPLICATION_STATUS_APPLICANT_LABEL.SUBMITTED },
  { key: 'intv', label: APPLICATION_STATUS_APPLICANT_LABEL.INTERVIEW_PENDING },
  { key: 'pass', label: APPLICATION_STATUS_APPLICANT_LABEL.ACCEPTED },
  { key: 'fail', label: APPLICATION_STATUS_APPLICANT_LABEL.REJECTED },
];
