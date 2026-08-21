import type {
  Bank,
  BillingType,
  CashbookCategory,
  CashbookEntryType,
  FeeStatus,
  PaymentMethod,
} from '@duing/types';

const BILLING_TYPE_LABEL: Record<BillingType, string> = {
  MONTHLY: '월 회비',
  SEMESTER: '학기 회비',
  YEARLY: '연 회비',
  ONE_TIME: '일회성',
};

const FEE_STATUS_LABEL: Record<FeeStatus, string> = {
  PENDING: '납부대기',
  PAID: '납부완료',
  PARTIAL_PAID: '부분납부',
  OVERDUE: '연체',
  CANCELLED: '취소됨',
};

// 상태별 뱃지 색. CANCELLED 는 회색, 미납/부분납부는 warm, 연체는 coral, 납부완료는 sage.
const FEE_STATUS_BADGE_CLS: Record<FeeStatus, string> = {
  PENDING: 'bg-warm/15 text-charcoal',
  PAID: 'bg-sage/20 text-sage',
  PARTIAL_PAID: 'bg-warm/15 text-charcoal',
  OVERDUE: 'bg-coral/10 text-coral',
  CANCELLED: 'bg-graysoft text-charcoal-3',
};

// 상태 라벨과 배지 색을 한 쌍으로 반환한다 — 호출부가 같은 조건을 두 번 쓰다 한쪽만 바뀌는 것을 막는다
// (recruitmentStatusChip 전례). 학생·운영진 화면 공용. admin 콘솔은 pill-* 토큰 체계라 별도 유지.
// 인자는 표기 축(displayStatus)을 넘긴다 — 액션 게이트는 저장 status 를 그대로 본다.
export function feeStatusChip(status: FeeStatus): { label: string; badgeClass: string } {
  return { label: FEE_STATUS_LABEL[status], badgeClass: FEE_STATUS_BADGE_CLS[status] };
}

// 회비 계좌 은행 코드 → 한글 표시명. 백엔드 Bank enum(19개 코드)과 1:1 대응한다.
const BANK_LABEL: Record<Bank, string> = {
  KB: 'KB국민',
  SHINHAN: '신한',
  WOORI: '우리',
  HANA: '하나',
  NH: 'NH농협',
  IBK: 'IBK기업',
  KAKAO: '카카오뱅크',
  TOSS: '토스뱅크',
  SC: 'SC제일',
  BUSAN: '부산',
  IM: 'iM뱅크(대구)',
  KYONGNAM: '경남',
  GWANGJU: '광주',
  JEONBUK: '전북',
  MG: '새마을금고',
  SHINHYUP: '신협',
  POST: '우체국',
  KDB: 'KDB산업',
  SUHYUP: '수협',
};

// 납부 수단 코드 → 한글 표시명. 표시는 4종 모두 다루고, 수동 기록 폼은 3종만 노출(스키마가 강제).
const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: '현금',
  TRANSFER: '계좌이체',
  OTHER: '기타',
  AUTO_MATCHED: '자동매칭',
};

export const billingTypeLabel = (type: BillingType): string => BILLING_TYPE_LABEL[type];

export const feeStatusLabel = (status: FeeStatus): string => FEE_STATUS_LABEL[status];

export const bankLabel = (bank: Bank): string => BANK_LABEL[bank];

export const paymentMethodLabel = (method: PaymentMethod): string => PAYMENT_METHOD_LABEL[method];

export const formatWon = (amount: number): string => `${amount.toLocaleString('ko-KR')}원`;

// 금전출납부 카테고리 코드 → 한글 표시명. 백엔드 CashbookCategory enum 과 1:1 대응(OTHER 는 수입·지출 공용).
const CASHBOOK_CATEGORY_LABEL: Record<CashbookCategory, string> = {
  FEE: '회비',
  SPONSOR: '후원금',
  SUBSIDY: '지원금',
  MT: 'MT',
  DINING: '회식',
  SNACK: '간식',
  SUPPLY: '비품',
  MARKETING: '홍보비',
  OTHER: '기타',
};

// OTHER + customCategory 가 있으면 직접입력 값을 우선 표시한다.
export function cashbookCategoryLabel(categoryCode: CashbookCategory, customCategory?: string | null): string {
  if (categoryCode === 'OTHER' && customCategory) {
    return customCategory;
  }
  return CASHBOOK_CATEGORY_LABEL[categoryCode];
}

export function cashbookEntryTypeLabel(entryType: CashbookEntryType): string {
  return entryType === 'INCOME' ? '수입' : '지출';
}
