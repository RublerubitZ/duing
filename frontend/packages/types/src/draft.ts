export type DraftAnswer = {
  questionId: number;
  value: string;
};

export type ApplicationDraft = {
  exists: boolean;
  answers: DraftAnswer[];
  updatedAt: string | null;
};

export type UpsertDraftPayload = {
  answers: DraftAnswer[];
};
