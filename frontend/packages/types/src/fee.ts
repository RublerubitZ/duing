// 회비(fee) 도메인 타입 — 백엔드 fee 컨트롤러 응답/요청 DTO 와 1:1 매핑.
// 응답 envelope(ApiResponse<T>)·페이지(PageResponse<T>)는 ./api 의 것을 재사용한다.

export type BillingType = 'MONTHLY' | 'SEMESTER' | 'YEARLY' | 'ONE_TIME';
export type FeeStatus = 'PENDING' | 'PAID' | 'PARTIAL_PAID' | 'OVERDUE' | 'CANCELLED';

// 회비 계좌 은행 코드. 백엔드 Bank enum(V61 bank CHECK 제약)과 정확히 일치한다.
// 한글 표시명은 프론트(apps/web/app/_lib/feeLabels)가 보유한다.
// 단일 출처(tuple) — 스키마(z.enum)·select 옵션·라벨 맵이 모두 이 순서를 그대로 파생한다.
export const BANKS = [
  'KB',
  'SHINHAN',
  'WOORI',
  'HANA',
  'NH',
  'IBK',
  'KAKAO',
  'TOSS',
  'SC',
  'BUSAN',
  'IM',
  'KYONGNAM',
  'GWANGJU',
  'JEONBUK',
  'MG',
  'SHINHYUP',
  'POST',
  'KDB',
  'SUHYUP',
] as const;

export type Bank = (typeof BANKS)[number];

// FeeAccountResponse(bank, accountNumber, accountHolder) 미러. accountNumber 는 서버가 복호화한 평문.
// 백엔드 응답에 id 가 없어(동아리당 1건) 타입에도 두지 않는다.
export type FeeAccount = {
  bank: Bank;
  accountNumber: string;
  accountHolder: string;
};

// UpsertFeeAccountRequest(bank, accountNumber, accountHolder) 미러. 동아리당 1건 — 없으면 생성, 있으면 갱신.
export type FeeAccountPayload = {
  bank: Bank;
  accountNumber: string;
  accountHolder: string;
};

// FeePolicyResponse(id, name, amount, billingType, active) 미러.
export type FeePolicy = {
  id: number;
  name: string;
  amount: number;
  billingType: BillingType;
  active: boolean;
};

// FeeBillResponse 미러(운영진 청구 현황). LocalDate 는 ISO 문자열(YYYY-MM-DD)로 직렬화된다.
export type FeeBill = {
  id: number;
  clubId: number;
  userId: number;
  feePolicyId: number;
  amount: number;
  billingPeriod: string;
  billingStartDate: string;
  billingEndDate: string;
  dueDate: string;
  status: FeeStatus;
};

// MyFeeResponse 미러(회원 본인 조회). 본인 데이터라 userId 가 없다(백엔드 DTO 와 정합).
export type MyFee = {
  id: number;
  clubId: number;
  feePolicyId: number;
  amount: number;
  billingPeriod: string;
  billingStartDate: string;
  billingEndDate: string;
  dueDate: string;
  status: FeeStatus;
};

// GenerateBillsResponse(created, skipped) 미러.
export type GenerateBillsResult = { created: number; skipped: number };

// CreateFeePolicyRequest(name, amount, billingType) 미러.
export type CreateFeePolicyPayload = { name: string; amount: number; billingType: BillingType };

// UpdateFeePolicyRequest(name?, amount?, billingType?, active?) 미러(부분 수정).
export type UpdateFeePolicyPayload = Partial<CreateFeePolicyPayload> & { active?: boolean };

// GenerateBillsRequest(billingPeriod, billingStartDate?, billingEndDate?, dueDate?) 미러.
// 단일 flat 와이어 페이로드 — billingType discriminator 를 싣지 않는다(백엔드 단일 DTO 와 정합).
export type GenerateBillsPayload = {
  billingPeriod: string;
  billingStartDate?: string;
  billingEndDate?: string;
  dueDate?: string;
};

// GET /leader/clubs/{clubId}/fee-bills 의 동적 필터 + 페이지네이션 쿼리.
export type BillSearchParams = {
  billingPeriod?: string;
  status?: FeeStatus;
  userId?: number;
  page?: number;
  size?: number;
};

// GET /my/fees 의 옵션 필터 쿼리.
export type MyFeeSearchParams = {
  clubId?: number;
  status?: FeeStatus;
};
