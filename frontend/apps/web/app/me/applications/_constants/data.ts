/* ============================================================
   지원현황 — 타입 정의 + 상수 + 목업 데이터
   (a-apply-status.jsx 의 1번 섹션을 TypeScript 로 변환)
   ============================================================ */

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
  | 'doc-review'
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
   ============================================================ */
export const STATUS_META: Record<string, StatusMetaEntry> = {
  'doc-review':          { label: '서류심사 중', pill: 'warm',  textColor: '#8E6620', bg: '#FBEFD7' },
  'interview-scheduled': { label: '면접 예정',   pill: 'coral', textColor: '#9A3F23', bg: '#FCE2D9' },
  'interview-pending':   { label: '면접/인터뷰', pill: 'sky',   textColor: '#2F557A', bg: '#DDE8F1' },
  'passed':              { label: '최종 합격',   pill: 'sage',  textColor: '#1F4A36', bg: '#D5E5D7' },
  'failed':              { label: '불합격',      pill: 'fail',  textColor: '#9A3F23', bg: '#FCE2D9' },
  'applied':             { label: '지원 완료',   pill: 'muted', textColor: '#4A504F', bg: '#EDEAE0' },
};



/* status → filter key 매핑 */
export const STATUS_TO_FILTER: Record<string, FilterKey | undefined> = {
  'doc-review':          'doc',
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

/* 통합 필터 — 상단 pill 탭과 우측 체크박스 모두 동일하게 사용 */
export const FILTERS: Filter[] = [
  { key: 'all',  label: '전체' },
  { key: 'doc',  label: '서류심사' },
  { key: 'intv', label: '면접/인터뷰' },
  { key: 'pass', label: '합격' },
  { key: 'fail', label: '불합격' },
];
