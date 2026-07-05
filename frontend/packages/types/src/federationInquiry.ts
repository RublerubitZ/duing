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

export type FederationInquiryDetail = {
  id: number;
  title: string;
  content: string;
  status: FederationInquiryStatus;
  createdAt: string;
  closedReason: string | null;
  answer: FederationInquiryAnswer | null;
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
};

export type CreateFederationInquiryPayload = { title: string; content: string };
export type UpdateFederationInquiryPayload = CreateFederationInquiryPayload;
export type ChangeFederationInquiryStatusPayload = {
  status: FederationInquiryStatus;
  version?: number;
  closedReason?: string;
};
export type AnswerFederationInquiryPayload = { content: string; version?: number };
export type UpdateFederationInquiryAnswerPayload = { content: string };
