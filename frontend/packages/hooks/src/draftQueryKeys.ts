export const draftQueryKeys = {
  all: ['drafts'] as const,
  byRecruitment: (recruitmentId: number) =>
    [...draftQueryKeys.all, recruitmentId] as const,
};
