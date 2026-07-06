export type FederationFaqCategory = {
  id: number;
  name: string;
  sortOrder: number;
};

export type FederationFaqItem = {
  id: number;
  categoryId: number;
  categoryName: string | null;
  question: string;
  answer: string;
  pinned: boolean;
};

export type AdminFederationFaqSummary = {
  id: number;
  categoryId: number;
  categoryName: string | null;
  question: string;
  answer: string;
  pinned: boolean;
  published: boolean;
  sortOrder: number;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  updatedAt: string;
};

export type CreateFederationFaqPayload = {
  categoryId: number;
  question: string;
  answer: string;
  pinned: boolean;
  published: boolean;
};

export type UpdateFederationFaqPayload = CreateFederationFaqPayload;

export type CreateFederationFaqCategoryPayload = { name: string };

export type UpdateFederationFaqCategoryPayload = { name: string; sortOrder: number };

export type FederationFaqFeedbackPayload = { helpful: boolean; sessionKey?: string };
