/**
 * /introduce 페이지 전용 데모 데이터.
 * 홍보 랜딩에 노출되는 정적 미리보기용이며 실제 도메인 데이터와 무관하다.
 * 색은 DESIGN.md 액센트 토큰(ink/ink-soft/berry/warm/sky/coral)값을 그대로 쓴다.
 */

export type PromoClub = {
  id: string;
  name: string;
  cat: '학술' | '운동' | '음악' | '공연' | '봉사' | '문화' | 'IT' | '창업' | '친목';
  members: number;
  /** 카테고리 틴트용 액센트 hex (DESIGN.md 토큰값) */
  accent: string;
};

export const promoClubs: ReadonlyArray<PromoClub> = [
  { id: 'code', name: '두잉코드', cat: 'IT', members: 64, accent: '#1F4A36' },
  { id: 'stat', name: 'STAT 통계학회', cat: '학술', members: 48, accent: '#2E6149' },
  { id: 'trem', name: '트레몰로', cat: '음악', members: 32, accent: '#B65672' },
  { id: 'rebd', name: '리바운드', cat: '운동', members: 56, accent: '#E8B968' },
  { id: 'cine', name: '씨네두잉', cat: '문화', members: 40, accent: '#6A95B8' },
  { id: 'tog', name: '함께해요', cat: '봉사', members: 38, accent: '#D97757' },
  { id: 'pix', name: '픽셀팩토리', cat: 'IT', members: 31, accent: '#1F4A36' },
  { id: 'book', name: '북클럽 두잉', cat: '학술', members: 22, accent: '#2E6149' },
];

export type PromoApplicantStatus = '검토중' | '면접확정' | '합격';

export type PromoApplicant = {
  id: string;
  name: string;
  dept: string;
  status: PromoApplicantStatus;
};

export const promoApplicants: ReadonlyArray<PromoApplicant> = [
  { id: 'a1', name: '김도윤', dept: '컴퓨터공학과', status: '면접확정' },
  { id: 'a2', name: '이서연', dept: '경영학과', status: '검토중' },
  { id: 'a3', name: '박지호', dept: '산업디자인학과', status: '합격' },
  { id: 'a4', name: '오현우', dept: '컴퓨터공학과', status: '검토중' },
];

/** 모집 펀넬 — 지원자 관리 대시보드 목업의 미니 통계 */
export type PromoFunnelStage = { label: string; value: number };

export const promoFunnel: ReadonlyArray<PromoFunnelStage> = [
  { label: '지원', value: 43 },
  { label: '서류', value: 31 },
  { label: '면접', value: 18 },
  { label: '합격', value: 12 },
];

/** 면접 자동배정 목업 — 확정된 슬롯 한 줄 */
export type PromoInterviewSlot = {
  id: string;
  name: string;
  day: string;
  time: string;
};

export const promoInterviewSlots: ReadonlyArray<PromoInterviewSlot> = [
  { id: 's1', name: '김도윤', day: '토', time: '13:30' },
  { id: 's2', name: '이서연', day: '토', time: '14:00' },
  { id: 's3', name: '박지호', day: '일', time: '11:00' },
];

/** 회비·은행 자동매칭 목업 — 입금 거래 → 매칭된 부원 */
export type PromoFeeMatch = {
  id: string;
  payer: string;
  member: string;
  amount: number;
  matched: boolean;
};

// 마지막 항목은 입금자명이 마스킹돼(박**) 부원과 자동 매칭되지 않는 "확인 필요" 상태를 시연한다.
export const promoFeeMatches: ReadonlyArray<PromoFeeMatch> = [
  { id: 'f1', payer: '김도윤', member: '김도윤', amount: 30000, matched: true },
  { id: 'f2', payer: '이서연', member: '이서연', amount: 30000, matched: true },
  { id: 'f3', payer: '박**', member: '박지호', amount: 30000, matched: false },
];
