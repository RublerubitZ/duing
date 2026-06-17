// BANK 매칭(bank) 도메인 타입 — 백엔드 fee 도메인의 BANK 거래/매칭 컨트롤러 응답/요청 DTO 와 1:1 매핑.
// 페이지(PageResponse<T>)는 ./api 의 것을 재사용한다.

// MatchStatus enum 미러. 검토 큐 거래 1건의 매칭 상태.
//   PENDING        — 미검토(매칭 후보 candidates 가 채워짐)
//   AUTO_MATCHED   — 동기화 시 자동 매칭됨
//   MANUAL_MATCHED — 운영진이 수동 승인함
//   IGNORED        — 운영진이 무시 처리함
export type MatchStatus = 'PENDING' | 'AUTO_MATCHED' | 'MANUAL_MATCHED' | 'IGNORED';

// TransactionType enum 미러. DEPOSIT(입금)만 매칭 대상이 된다.
export type TransactionType = 'DEPOSIT' | 'WITHDRAWAL';

// MatchCandidateResponse 미러. PENDING 입금에 동봉되는 매칭 후보 청구 1건.
// dueDate 는 LocalDate(YYYY-MM-DD). remaining 은 후보 청구의 잔액(원, long).
export type MatchCandidate = {
  feeBillId: number;
  userId: number;
  memberName: string;
  billingPeriod: string;
  dueDate: string;
  remaining: number;
};

// BankTransactionResponse 미러. 검토 큐 거래 1건.
// transactionAt 은 LocalDateTime(ISO 일시 문자열). counterparty/matchedFeeBillId 는 null 가능.
// candidates 는 PENDING 입금이면 매칭 후보 청구가 채워지고, 그 외엔 빈 배열이다.
// matchedMemberName/matchedBillingPeriod 는 이미 매칭된 거래에서만 채워지고(총무가 입금자명과 대조해
// 오매칭을 잡도록), PENDING/무시 거래에서는 null 이다. 탈퇴 회원이면 이름이 null 일 수 있다.
export type BankTransaction = {
  id: number;
  transactionAt: string;
  amount: number;
  counterparty: string | null;
  transactionType: TransactionType;
  matchStatus: MatchStatus;
  matchedFeeBillId: number | null;
  candidates: MatchCandidate[];
  matchedMemberName: string | null;
  matchedBillingPeriod: string | null;
};

// SyncResultResponse 미러. 거래 동기화 결과(적재 건수). 인증정보는 어떤 필드에도 포함되지 않는다.
export type SyncResult = {
  fetched: number;
  newlyStored: number;
  autoMatched: number;
  pendingReview: number;
};

// SyncBankTransactionsRequest 미러. 계좌 비밀번호·주민등록번호 앞 6자리.
// 민감 인증정보 — 영속화/로깅 금지. 폼은 제출 후 즉시 리셋한다.
export type SyncBankTransactionsPayload = {
  accountPassword: string;
  residentNumber: string;
};

// BankMatchingClubResponse 미러. ADMIN BANK 자동매칭 관리 화면의 동아리 한 행.
// eligible=false 면 ineligibleReason 에 사유가 담기고, true 면 null 이다.
export type BankMatchingClub = {
  clubId: number;
  clubName: string;
  eligible: boolean;
  ineligibleReason: string | null;
  registered: boolean;
};

// BankMatchingOverviewResponse.SlotStatus 미러. 인증 키 단위 전역 계좌 등록 슬롯 현황.
export type BankMatchingSlots = {
  registeredCount: number;
  maxAccounts: number;
  remaining: number;
};

// BankMatchingOverviewResponse 미러. 동아리별 상태 목록 + 전역 슬롯 현황.
// slots 는 BANK API 일시 장애 시 null 일 수 있다(graceful degrade) — 이때도 clubs 는 정상 반환된다.
export type BankMatchingOverview = {
  clubs: BankMatchingClub[];
  slots: BankMatchingSlots | null;
};

// GET /leader/clubs/{clubId}/bank-transactions 의 동적 필터 + 페이지네이션 쿼리.
// status 미지정 시 백엔드는 PENDING 으로 기본 동작한다.
export type BankTransactionSearchParams = {
  status?: MatchStatus;
  page?: number;
  size?: number;
};
