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
  kind: 'wordmark' | 'mountain' | 'alpha' | 'stack';
  text?: string;
  lines?: string[];
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
  | 'final-pending'
  | 'passed'
  | 'failed'
  | 'cancelled'
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

export type FilterKey = 'all' | 'doc' | 'intv' | 'final' | 'pass' | 'fail' | 'cancel';

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
  'cancelled':           { label: '취소',        pill: 'muted', textColor: '#6F7574', bg: '#E5E2DA' },
};

/* ============================================================
   APPS — 목업 데이터
   ============================================================ */
export const APPS: App[] = [
  {
    id: 'spark',
    name: '스파크',
    cat: '학술',
    tag: 'IT · 창업 기획 스터디 동아리',
    appliedDate: '2025.09.12',
    appliedAt: '2025.09.12 (금) 15:30',
    division: '일반 지원',
    department: '기획팀',
    files: [
      { type: '지원서 파일',     name: '지원서_스파크_김두잉.pdf' },
      { type: '자기소개서 파일', name: '자기소개서_김두잉.pdf' },
      { type: '포트폴리오 파일', name: '포트폴리오_김두잉.pdf' },
    ],
    memo: 'IT · 기획 분야에 관심이 많아 스파크의 프로젝트가 기대됩니다. 다양한 경험을 통해 기여하고 싶어요!',
    steps: [
      { label: '서류접수',    date: '2025.09.12',      state: 'done' },
      { label: '서류심사',    date: '2025.09.15',      state: 'done' },
      { label: '면접/인터뷰', date: '2025.09.26 예정', state: 'current' },
      { label: '최종발표',    date: '-',               state: 'pending' },
    ],
    status: 'interview-scheduled',
    right: { eyebrow: '면접일', value: '2025.09.28 (일)', sub: '14:00' },
    logo: { kind: 'wordmark', text: 'Spark', bg: '#1F3D2C', fg: '#E8EEE8' },
  },
  {
    id: 'voyage',
    name: '보야지',
    cat: '봉사',
    tag: '국내 · 해외 봉사활동 기획 동아리',
    appliedDate: '2025.09.10',
    appliedAt: '2025.09.10 (수) 10:12',
    division: '일반 지원',
    department: '봉사기획팀',
    files: [{ type: '지원서 파일', name: '지원서_보야지_김두잉.pdf' }],
    memo: '봉사활동을 통해 더 넓은 시야를 가지고 싶어 지원합니다.',
    steps: [
      { label: '서류접수',    date: '2025.09.10', state: 'done' },
      { label: '서류심사',    date: '심사 중',    state: 'current' },
      { label: '면접/인터뷰', date: '-',          state: 'pending' },
      { label: '최종발표',    date: '-',          state: 'pending' },
    ],
    status: 'doc-review',
    right: { eyebrow: '결과 발표 예정', value: '2025.09.20 (토)' },
    logo: { kind: 'mountain', text: 'VOYAGE', bg: '#2A2925', fg: '#E8EEE8' },
  },
  {
    id: 'artive',
    name: '아르티브',
    cat: '예술',
    tag: '공연 · 전시 기획 및 운영 동아리',
    appliedDate: '2025.09.05',
    appliedAt: '2025.09.05 (금) 19:40',
    division: '일반 지원',
    department: '기획운영팀',
    files: [
      { type: '지원서 파일',     name: '지원서_아르티브_김두잉.pdf' },
      { type: '자기소개서 파일', name: '자기소개서_김두잉.pdf' },
    ],
    memo: '공연 기획 경험을 살려 아르티브의 무대를 함께 만들고 싶어요.',
    steps: [
      { label: '서류접수',    date: '2025.09.05', state: 'done' },
      { label: '서류심사',    date: '2025.09.10', state: 'done' },
      { label: '면접/인터뷰', date: '2025.09.15', state: 'done' },
      { label: '최종발표',    date: '2025.09.18', state: 'done' },
    ],
    status: 'passed',
    right: { eyebrow: '합격일', value: '2025.09.18' },
    logo: { kind: 'wordmark', text: 'ARTIVE', bg: '#5F6B45', fg: '#F1EFE0' },
  },
  {
    id: 'link',
    name: '링크',
    cat: '연합',
    tag: '대학생 연합 기획 프로젝트',
    appliedDate: '2025.09.01',
    appliedAt: '2025.09.01 (월) 11:22',
    division: '일반 지원',
    department: '프로젝트팀',
    files: [{ type: '지원서 파일', name: '지원서_링크_김두잉.pdf' }],
    memo: '여러 학교 학생들과 협업하는 프로젝트에 도전하고 싶어요.',
    steps: [
      { label: '서류접수',    date: '2025.09.01', state: 'done' },
      { label: '서류심사',    date: '심사 중',    state: 'current' },
      { label: '면접/인터뷰', date: '-',          state: 'pending' },
      { label: '최종발표',    date: '-',          state: 'pending' },
    ],
    status: 'doc-review',
    right: { eyebrow: '결과 발표 예정', value: '2025.09.15 (월)' },
    logo: { kind: 'wordmark', text: 'L!NK', bg: '#1B1B1B', fg: '#F2F2F2' },
  },
  {
    id: 'alpha',
    name: '알파',
    cat: '학술',
    tag: '수학 · 통계 학술 연구 동아리',
    appliedDate: '2025.08.28',
    appliedAt: '2025.08.28 (목) 22:05',
    division: '일반 지원',
    department: '학술팀',
    files: [
      { type: '지원서 파일',     name: '지원서_알파_김두잉.pdf' },
      { type: '자기소개서 파일', name: '자기소개서_김두잉.pdf' },
    ],
    memo: '통계 분석에 관심이 많아 더 깊이 공부해보고 싶었습니다.',
    steps: [
      { label: '서류접수',    date: '2025.08.28', state: 'done' },
      { label: '서류심사',    date: '2025.09.01', state: 'done' },
      { label: '면접/인터뷰', date: '2025.09.04', state: 'done' },
      { label: '최종발표',    date: '2025.09.06', state: 'failed' },
    ],
    status: 'failed',
    right: { eyebrow: '발표일', value: '2025.09.06' },
    logo: { kind: 'alpha', text: 'α', bg: '#F1D9DE', fg: '#7E2A45' },
  },
  {
    id: 'greenus',
    name: '그린어스',
    cat: '환경',
    tag: '지속가능한 캠퍼스 환경 활동',
    appliedDate: '2025.08.25',
    appliedAt: '2025.08.25 (월) 13:01',
    division: '일반 지원',
    department: '환경기획팀',
    files: [{ type: '지원서 파일', name: '지원서_그린어스_김두잉.pdf' }],
    memo: '캠퍼스의 환경 문제를 함께 고민하고 싶어요.',
    steps: [
      { label: '서류접수', date: '2025.08.25', state: 'done' },
    ],
    status: 'cancelled',
    right: null,
    logo: { kind: 'stack', lines: ['GREEN', 'US'], bg: '#7A9E78', fg: '#F4F8F2' },
  },
  {
    id: 'coderunner',
    name: '코드러너',
    cat: 'IT',
    tag: '주니어 개발자 사이드 프로젝트 동아리',
    appliedDate: '2025.09.08',
    appliedAt: '2025.09.08 (월) 11:42',
    division: '일반 지원',
    department: '개발팀',
    files: [
      { type: '지원서 파일',     name: '지원서_코드러너_김두잉.pdf' },
      { type: '자기소개서 파일', name: '자기소개서_김두잉.pdf' },
    ],
    memo: '사이드 프로젝트를 함께 만들 동료를 찾고 있어요.',
    steps: [
      { label: '서류접수',    date: '2025.09.08',      state: 'done' },
      { label: '서류심사',    date: '2025.09.12',      state: 'done' },
      { label: '면접/인터뷰', date: '2025.09.30 예정', state: 'current' },
      { label: '최종발표',    date: '-',               state: 'pending' },
    ],
    status: 'interview-scheduled',
    right: { eyebrow: '면접일', value: '2025.09.30 (화)', sub: '16:00' },
    logo: { kind: 'wordmark', text: 'CODE', bg: '#243B2F', fg: '#E8EEE8' },
  },
  {
    id: 'eco',
    name: '에코',
    cat: '환경',
    tag: '친환경 캠페인 기획 동아리',
    appliedDate: '2025.08.18',
    appliedAt: '2025.08.18 (월) 09:11',
    division: '일반 지원',
    department: '캠페인팀',
    files: [
      { type: '지원서 파일',     name: '지원서_에코_김두잉.pdf' },
      { type: '자기소개서 파일', name: '자기소개서_김두잉.pdf' },
    ],
    memo: '지속가능한 캠퍼스를 만드는 데 기여하고 싶습니다.',
    steps: [
      { label: '서류접수',    date: '2025.08.18', state: 'done' },
      { label: '서류심사',    date: '2025.08.22', state: 'done' },
      { label: '면접/인터뷰', date: '2025.08.26', state: 'done' },
      { label: '최종발표',    date: '2025.08.30', state: 'done' },
    ],
    status: 'passed',
    right: { eyebrow: '합격일', value: '2025.08.30' },
    logo: { kind: 'wordmark', text: 'ECO', bg: '#3D6B4A', fg: '#EFF6EE' },
  },
];

/* status → filter key 매핑 */
export const STATUS_TO_FILTER: Record<string, FilterKey | undefined> = {
  'doc-review':          'doc',
  'interview-scheduled': 'intv',
  'interview-pending':   'intv',
  'final-pending':       'final',
  'passed':              'pass',
  'failed':              'fail',
  'cancelled':           'cancel',
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
  { key: 'all',    label: '전체' },
  { key: 'doc',    label: '서류심사' },
  { key: 'intv',   label: '면접/인터뷰' },
  { key: 'final',  label: '최종발표' },
  { key: 'pass',   label: '합격' },
  { key: 'fail',   label: '불합격' },
  { key: 'cancel', label: '취소' },
];
