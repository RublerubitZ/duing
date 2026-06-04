// ─── LEADER 재인증 컨텍스트 타입 ──────────────────────────────────────────────

export type OpenRoundSummary = {
  id: number;
  year: number;
  label: string;
};

export type LeaderPendingRecertification = {
  id: number;
  operatingYear: number;
  contactEmail: string;
  contactPhone: string;
  createdAt: string;
};

export type LeaderRecertificationContext = {
  centralClub: boolean;
  lastVerifiedYear: number | null;
  openRound: OpenRoundSummary | null;
  pendingRequest: LeaderPendingRecertification | null;
};

export type SubmitRecertificationRequestPayload = {
  contactEmail: string;
  contactPhone: string;
  operatingYear: number;
  notes?: string;
};
