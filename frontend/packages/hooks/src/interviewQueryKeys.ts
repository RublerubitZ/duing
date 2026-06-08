export const interviewQueryKeys = {
  all: ['interview'] as const,
  config: (recruitmentId: number) =>
    [...interviewQueryKeys.all, 'config', recruitmentId] as const,
  slots: (recruitmentId: number) =>
    [...interviewQueryKeys.all, 'slots', recruitmentId] as const,
  schedules: (recruitmentId: number) =>
    [...interviewQueryKeys.all, 'schedules', recruitmentId] as const,
  candidates: (recruitmentId: number) =>
    [...interviewQueryKeys.all, 'candidates', recruitmentId] as const,
  applicantSlots: (recruitmentId: number) =>
    [...interviewQueryKeys.all, 'applicant-slots', recruitmentId] as const,
  availabilities: (applicationId: number) =>
    [...interviewQueryKeys.all, 'availabilities', applicationId] as const,
  mySchedule: (applicationId: number) =>
    [...interviewQueryKeys.all, 'my-schedule', applicationId] as const,
};
