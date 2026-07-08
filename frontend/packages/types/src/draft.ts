export type DraftAnswer = {
  questionId: string; // 질문 UUID (V78 이후 서버 표준)
  values: string[]; // TEXT=본문 1개, SINGLE=choiceId 0~1개, MULTIPLE=choiceId 목록
};

export type ApplicationDraft = {
  exists: boolean;
  answers: DraftAnswer[];
  updatedAt: string | null;
};

export type UpsertDraftPayload = {
  answers: DraftAnswer[];
};
