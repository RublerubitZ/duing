export type FederationInquiryStatus = 'RECEIVED' | 'IN_PROGRESS' | 'ANSWERED' | 'CLOSED';

export type FederationInquirySummary = {
  id: number;
  title: string;
  status: FederationInquiryStatus;
  createdAt: string;
  answeredAt: string | null;
};

export type FederationInquiryAnswer = {
  content: string;
  answeredAt: string;
  updatedAt: string;
};

// 비밀성: storageKey·URL 은 응답에 없다 — 원본 바이트는 인증 프록시 다운로드로만 접근한다.
export type FederationInquiryAttachment = {
  id: number;
  fileName: string;
  contentType: string;
  fileSize: number;
};

export type FederationInquiryDetail = {
  id: number;
  title: string;
  content: string;
  status: FederationInquiryStatus;
  createdAt: string;
  closedReason: string | null;
  answer: FederationInquiryAnswer | null;
  attachments: FederationInquiryAttachment[];
};

export type AdminFederationInquirySummary = {
  id: number;
  title: string;
  status: FederationInquiryStatus;
  authorName: string;
  authorStudentId: string;
  createdAt: string;
  answeredAt: string | null;
};

export type AdminFederationInquiryDetail = {
  id: number;
  title: string;
  content: string;
  status: FederationInquiryStatus;
  version: number;
  authorName: string;
  authorStudentId: string;
  createdAt: string;
  answeredAt: string | null;
  closedReason: string | null;
  answer: FederationInquiryAnswer | null;
  attachments: FederationInquiryAttachment[];
};

// attachmentUrls: 생성 시 미지정=첨부 없음. 수정 시 clear-intent 규약 — 생략(undefined)=기존 유지,
// []=전체 삭제, 배열=전체 교체(PUT 의미론).
export type CreateFederationInquiryPayload = {
  title: string;
  content: string;
  attachmentUrls?: string[];
};
export type UpdateFederationInquiryPayload = CreateFederationInquiryPayload;
export type ChangeFederationInquiryStatusPayload = {
  status: FederationInquiryStatus;
  version?: number;
  closedReason?: string;
};
export type AnswerFederationInquiryPayload = { content: string; version?: number };
export type UpdateFederationInquiryAnswerPayload = { content: string };
