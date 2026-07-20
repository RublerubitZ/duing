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
