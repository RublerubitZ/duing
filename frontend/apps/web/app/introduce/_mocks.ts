/**
 * /introduce 페이지 전용 데모 데이터.
 * 홍보 랜딩에 노출되는 정적 미리보기용이며 실제 도메인 데이터와 무관하다.
 */

export type PromoClub = {
  id: string;
  name: string;
  cat: '학술' | '운동' | '음악' | '공연' | '봉사' | '문화' | 'IT' | '창업' | '친목';
  members: number;
  color: string;
  avatar: string;
};

export const promoClubs: PromoClub[] = [
  { id: 'trem', name: '트레몰로', cat: '음악', members: 32, color: '#B65672', avatar: '🎸' },
  { id: 'stat', name: 'STAT 통계학회', cat: '학술', members: 48, color: '#1F4A36', avatar: '📊' },
  { id: 'rebd', name: '리바운드', cat: '운동', members: 56, color: '#8E6620', avatar: '🏀' },
  { id: 'code', name: '두잉코드', cat: 'IT', members: 64, color: '#143025', avatar: '{ }' },
  { id: 'cine', name: '씨네두잉', cat: '문화', members: 40, color: '#2E6149', avatar: '🎬' },
  { id: 'tog', name: '함께해요', cat: '봉사', members: 38, color: '#2F557A', avatar: '🤝' },
  { id: 'pix', name: '픽셀팩토리', cat: 'IT', members: 31, color: '#143025', avatar: '▣' },
  { id: 'book', name: '북클럽 두잉', cat: '학술', members: 22, color: '#1F4A36', avatar: '📖' },
];

export type PromoApplicant = {
  id: string;
  name: string;
  dept: string;
  status: '검토중' | '면접확정' | '합격';
};

export const promoApplicants: PromoApplicant[] = [
  { id: 'a1', name: '김도윤', dept: '컴퓨터공학과', status: '면접확정' },
  { id: 'a2', name: '이서연', dept: '경영학과', status: '검토중' },
  { id: 'a3', name: '박지호', dept: '산업디자인학과', status: '합격' },
  { id: 'a4', name: '오현우', dept: '컴퓨터공학과', status: '검토중' },
];
