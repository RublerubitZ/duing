export const leaderRecertificationKeys = {
  all: ['leader', 'recertification'] as const,
  context: (clubId: number) =>
    [...leaderRecertificationKeys.all, 'context', clubId] as const,
};
