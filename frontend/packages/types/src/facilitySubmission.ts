// 학교 제출(Submission Batch) — BE 스펙 §5.1~5.2 계약과 1:1 (REJECTED 는 응답에서 제외)
export type SubmissionBookingStatus = 'PENDING' | 'APPROVED' | 'CONFIRMED' | 'CONFLICT' | 'CANCELLED';

export type SubmissionSummaryCounts = {
  approvedCount: number;
  awaitingCount: number;
  submittedCount: number;
  confirmedCount: number;
};

export type SubmissionCandidateBooking = {
  bookingId: number;
  // 전 시설 조회의 시설별 섹션 그룹핑용(BE §5.1 v3) — facilityName 은 조회 시점 결측 시 null.
  facilityId: number;
  facilityName: string | null;
  clubId: number;
  clubName: string | null;
  applicantName: string | null;
  contactPhone: string | null;
  reservationDate: string;
  startTime: string;
  endTime: string;
  purpose: string;
  attendeeCount: number | null;
  status: SubmissionBookingStatus;
  submitted: boolean;
  selectable: boolean;
  submissionNo: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
};

export type SubmissionCandidatesResponse = {
  summary: SubmissionSummaryCounts;
  bookings: SubmissionCandidateBooking[];
};

export type SubmissionCandidatesParams = {
  // 생략 시 전 시설의 제출 후보를 반환한다(BE §5.1 v3).
  facilityId?: number;
  startDate: string;
  endDate: string;
};

export type CreateSubmissionBatchPayload = {
  bookingIds: number[];
  memo?: string;
};

export type CreateSubmissionBatchResult = {
  batchId: number;
  submissionNo: string;
  csvFileName: string;
};

// 제출 목록/상세/완료 — BE 응답 record 와 1:1 (§5.3~5.5, PR-4a/4b).
export type SubmissionBatchSummary = {
  batchId: number;
  submissionNo: string;
  facilityId: number;
  facilityName: string | null;
  bookingCount: number;
  submittedAt: string; // 생성 시각(LocalDateTime ISO)
  submittedByName: string | null; // 탈퇴 관리자 null
  memo: string | null;
  cancelled: boolean;
  cancelledAt: string | null;
  completed: boolean;
  completedAt: string | null;
};

// 파생 상태 필터(개편 스펙 A3) — BE SubmissionBatchStatusFilter 와 1:1.
export type SubmissionBatchStatusFilter = 'REVIEWING' | 'COMPLETED' | 'CANCELLED';

export type SubmissionBatchListParams = { page: number; size: number; status?: SubmissionBatchStatusFilter };

export type SubmissionAuditEntry = {
  action: 'CREATED' | 'CANCELLED' | 'CSV_DOWNLOADED' | 'VIEWED' | 'COMPLETED';
  adminName: string | null; // 탈퇴 관리자 null
  createdAt: string; // BE 가 KST 환산 완료(Asia/Seoul) — FE 는 표시만
  ipAddress: string | null;
  detail: string | null; // COMPLETED 행 = 사람이 읽는 요약 그대로 노출
};

export type SubmissionBatchDetail = {
  batch: SubmissionBatchSummary;
  bookings: SubmissionCandidateBooking[]; // 후보 조회와 동일 Booking 스키마(BE 공유 record)
  audits: SubmissionAuditEntry[];
};

export type SkippedSubmissionBooking = {
  bookingId: number;
  status: SubmissionBookingStatus;
  reason: string; // BE Formatter 한글 라벨 그대로 — FE 재매핑 금지
};

export type CompleteSubmissionBatchResult = {
  totalCount: number;
  confirmedCount: number;
  skippedCount: number;
  completedAt: string;
  skippedBookings: SkippedSubmissionBooking[];
};
