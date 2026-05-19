export type ApplicationCardData = {
  club: string;
  cat: string;
  step: string;
  current: 1 | 2 | 3 | 4;
  color: string;
  icon: string;
  date: string;
  note: string;
  action: string;
  hi?: boolean;
};

export type NotificationItem = {
  id: number;
  title: string;
  time: string;
  unread: boolean;
};

export type JoinedClub = {
  name: string;
  cat: string;
  role: string;
  isAdmin: boolean;
  since: string;
  icon: string;
  next: string;
};

export type SavedClub = {
  id: number;
  name: string;
  cat: string;
  tag: string;
  avatar: string;
  color: string;
  recruit: boolean;
  deadline: string;
};

export type ActivityStat = {
  label: string;
  value: string;
  unit: string;
  hint: string;
};

export type ActivityTimelineItem = {
  date: string;
  club: string;
  type: string;
  title: string;
  attended: boolean;
};

export const MY_SECTIONS = [
  { id: 'notify',   label: '알림',          count: 4,   badge: true  },
  { id: 'apply',    label: '지원 현황',     count: 3,   badge: false },
  { id: 'joined',   label: '가입한 동아리', count: 2,   badge: false },
  { id: 'saved',    label: '찜한 동아리',   count: 8,   badge: false },
  { id: 'activity', label: '내 활동',        count: null, badge: false },
  { id: 'settings', label: '설정',           count: null, badge: false },
] as const;

export type SectionId = (typeof MY_SECTIONS)[number]['id'];

export const APPLICATIONS: ApplicationCardData[] = [
  {
    club: '두잉코드',
    cat: 'IT',
    step: '서류 접수',
    current: 1,
    color: '#143025',
    icon: '{ }',
    date: '2025.09.18 16:24',
    note: '지원서 작성중 (자동 저장)',
    action: '이어 작성하기',
  },
  {
    club: 'STAT 통계학회',
    cat: '학술',
    step: '면접 확정',
    current: 3,
    color: '#1F4A36',
    icon: '📊',
    date: '면접: 9.21 (토) 13:30',
    note: '학생회관 302호 — 5분 전 도착',
    action: '면접 일정 보기',
    hi: true,
  },
  {
    club: '트레몰로',
    cat: '음악',
    step: '서류 검토중',
    current: 2,
    color: '#B65672',
    icon: '🎸',
    date: '2025.09.17 22:15',
    note: '동아리에서 검토 중입니다',
    action: '지원서 보기',
  },
];

export const NOTIFICATION_ITEMS: NotificationItem[] = [
  { id: 1, title: 'UMC 동아리 지원 결과가 발표되었습니다',     time: '5분 전',    unread: true  },
  { id: 2, title: '내일 오후 1시 30분 면접 예정',               time: '2시간 전',  unread: true  },
  { id: 3, title: 'AI 학회 정기모임 일정이 등록되었습니다',     time: '오늘 10:24', unread: true  },
  { id: 4, title: '북클럽 두잉 출석 체크가 예정되어 있습니다', time: '어제 18:30', unread: true  },
  { id: 5, title: '새로운 공지가 등록되었습니다',               time: '어제 14:12', unread: false },
  { id: 6, title: '동아리 OT 일정이 안내되었습니다',            time: '어제 11:05', unread: false },
];

export const JOINED_CLUBS: JoinedClub[] = [
  {
    name: '씨네두잉',
    cat: '문화',
    role: '회원',
    isAdmin: false,
    since: '2024.03',
    icon: '🎬',
    next: '9.22 일 19:00 — 정기상영 (시네마운트)',
  },
  {
    name: '북클럽 두잉',
    cat: '학술',
    role: '운영진 · 기획팀',
    isAdmin: true,
    since: '2024.09',
    icon: '📖',
    next: '9.25 수 20:00 — 「세이렌의 노래」 토론',
  },
];

export const SAVED_CLUBS: SavedClub[] = [
  { id: 1, name: '두잉코드',      cat: 'IT',   tag: '웹·앱 개발 스터디 및 프로젝트',  avatar: '{ }', color: '#143025', recruit: true,  deadline: '9.22' },
  { id: 2, name: 'UMC',           cat: 'IT',   tag: '앱 개발 연합 동아리',              avatar: '📱',  color: '#1F4A36', recruit: true,  deadline: '9.25' },
  { id: 3, name: 'STAT 통계학회', cat: '학술', tag: '통계·데이터 분석 세미나',          avatar: '📊',  color: '#1F4A36', recruit: false, deadline: ''     },
  { id: 4, name: '트레몰로',      cat: '음악', tag: '기타·보컬 밴드 동아리',            avatar: '🎸',  color: '#B65672', recruit: true,  deadline: '9.20' },
  { id: 5, name: '씨네두잉',      cat: '문화', tag: '영화 감상 및 비평 모임',           avatar: '🎬',  color: '#6A95B8', recruit: true,  deadline: '9.28' },
  { id: 6, name: '북클럽 두잉',   cat: '학술', tag: '독서·토론 문화 동아리',            avatar: '📖',  color: '#4A504F', recruit: false, deadline: ''     },
  { id: 7, name: 'AI 학회',       cat: 'IT',   tag: '머신러닝·딥러닝 연구 모임',        avatar: '🤖',  color: '#143025', recruit: true,  deadline: '9.30' },
  { id: 8, name: '더잉',          cat: '문화', tag: '사진·영상 콘텐츠 동아리',          avatar: '📷',  color: '#B65672', recruit: false, deadline: ''     },
];

export const ACTIVITY_STATS: ActivityStat[] = [
  { label: '이번 학기 활동', value: '12', unit: '회', hint: '정기모임 + 행사' },
  { label: '출석률',         value: '92', unit: '%',  hint: '최근 30일'       },
  { label: '작성한 글',      value: '7',  unit: '건', hint: '게시판 · 후기'   },
  { label: '받은 좋아요',    value: '48', unit: '👍', hint: '누적'            },
];

export const ACTIVITY_TIMELINE: ActivityTimelineItem[] = [
  { date: '9.18', club: '북클럽 두잉', type: '정기모임', title: '「세이렌의 노래」 4장 토론',              attended: true  },
  { date: '9.15', club: '씨네두잉',    type: '정기상영', title: '기예르모 델 토로 — 셰이프 오브 워터',    attended: true  },
  { date: '9.12', club: '북클럽 두잉', type: '게시판',   title: '후기: 9월 첫 모임 — 좋은 책을 만나는 법', attended: false },
  { date: '9.08', club: '씨네두잉',    type: '정기상영', title: '원더풀 라이프 (코레에다 히로카즈)',       attended: true  },
];
