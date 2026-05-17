/**
 * 메인 랜딩 (/) 전용 데모 데이터.
 * 백엔드 의존을 피하기 위해 정적 미리보기 용도로만 사용된다.
 */

export type LandingBanner = {
  id: number;
  tag: string;
  title: string;
  sub: string;
  cta: string;
  bg: string;
  fg: '#fff' | string;
  accent: string;
  emoji: string;
};

export const landingBanners: LandingBanner[] = [
  {
    id: 1,
    tag: 'EVENT · 9.25 — 9.27',
    title: '가을 동아리 박람회 2025',
    sub: '67개 동아리 · 80개 부스 · 중앙광장',
    cta: '박람회 자세히 보기',
    bg: 'linear-gradient(120deg, #1F4A36 0%, #143025 100%)',
    fg: '#fff',
    accent: '#9DB6A0',
    emoji: '🍂',
  },
  {
    id: 2,
    tag: 'QUIZ · 30초 성향 테스트',
    title: '내게 맞는 동아리,\n어디일까요?',
    sub: '10개의 질문, 추천 동아리 3곳',
    cta: '테스트 시작',
    bg: 'linear-gradient(120deg, #E8EEE8 0%, #C9D8CC 100%)',
    fg: '#143025',
    accent: '#1F4A36',
    emoji: '✨',
  },
  {
    id: 3,
    tag: 'BENEFIT · 학생 제휴',
    title: '두잉 회원이면 15% 할인',
    sub: '스타벅스 · 교보문고 · 무신사 외 12곳',
    cta: '혜택 전체 보기',
    bg: 'linear-gradient(120deg, #FBEFD7 0%, #F3DEAA 100%)',
    fg: '#5C3F11',
    accent: '#8E6620',
    emoji: '🎁',
  },
  {
    id: 4,
    tag: 'NEW · 두잉 굿즈',
    title: '9월 가입하면 굿즈 증정',
    sub: '에코백 · 스티커팩 · 두잉 노트',
    cta: '혜택 받기',
    bg: 'linear-gradient(120deg, #FCE2D9 0%, #F4C0AE 100%)',
    fg: '#6A2611',
    accent: '#9A3F23',
    emoji: '📦',
  },
];

export type LandingCategory = {
  cat: '학술' | '음악' | '운동' | 'IT' | '공연' | '봉사' | '문화' | '창업';
  count: number;
  emoji: string;
  tone: 'sage' | 'warm' | 'berry' | 'coral' | 'sky' | 'ink';
};

export const landingCategories: LandingCategory[] = [
  { cat: '학술', count: 28, emoji: '📚', tone: 'sage' },
  { cat: '음악', count: 19, emoji: '🎵', tone: 'berry' },
  { cat: '운동', count: 24, emoji: '⚽', tone: 'warm' },
  { cat: 'IT', count: 12, emoji: '💻', tone: 'ink' },
  { cat: '공연', count: 11, emoji: '🎭', tone: 'coral' },
  { cat: '봉사', count: 16, emoji: '🤝', tone: 'sky' },
  { cat: '문화', count: 14, emoji: '🎨', tone: 'sage' },
  { cat: '창업', count: 9, emoji: '🚀', tone: 'warm' },
];

export type FeaturedClub = {
  id: string;
  name: string;
  tag: string;
  cat: '학술' | '운동' | '음악' | '공연' | '봉사' | '문화' | 'IT' | '창업' | '친목';
  members: number;
  gen: string;
  spots: string;
  deadline: string;
  color: string;
  avatar: string;
  recruit: boolean;
  scope: '중앙' | '과';
};

export const featuredClubs: FeaturedClub[] = [
  {
    id: 'trem',
    name: '트레몰로',
    tag: '어쿠스틱 기타 합주',
    cat: '음악',
    members: 32,
    gen: '27기',
    spots: '10명',
    deadline: '9.24',
    color: '#B65672',
    avatar: '🎸',
    recruit: true,
    scope: '중앙',
  },
  {
    id: 'stat',
    name: 'STAT 통계학회',
    tag: '데이터 · R · 통계분석',
    cat: '학술',
    members: 48,
    gen: '23기',
    spots: '15명',
    deadline: '9.22',
    color: '#1F4A36',
    avatar: '📊',
    recruit: true,
    scope: '중앙',
  },
  {
    id: 'code',
    name: '두잉코드',
    tag: '주니어 개발자 모임',
    cat: 'IT',
    members: 64,
    gen: '10기',
    spots: '20명',
    deadline: '9.27',
    color: '#143025',
    avatar: '{ }',
    recruit: true,
    scope: '중앙',
  },
  {
    id: 'cine',
    name: '씨네두잉',
    tag: '월 2회 영화 감상 · 토론',
    cat: '문화',
    members: 40,
    gen: '29기',
    spots: '12명',
    deadline: '9.25',
    color: '#2E6149',
    avatar: '🎬',
    recruit: true,
    scope: '중앙',
  },
];

export type RecruitmentTicker = {
  name: string;
  deadline: string;
  dDay: string;
};

export const recruitmentTickers: RecruitmentTicker[] = [
  { name: '트레몰로', deadline: '9.24', dDay: 'D-3' },
  { name: 'STAT 통계학회', deadline: '9.22', dDay: 'D-1' },
  { name: '스텝업', deadline: '9.23', dDay: 'D-2' },
  { name: '한모금', deadline: '9.24', dDay: 'D-3' },
  { name: '북클럽 두잉', deadline: '9.30', dDay: 'D-9' },
];
