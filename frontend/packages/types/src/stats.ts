export type StatsSummary = {
  total: number;
  submitted: number;
  underReview: number;
  interviewPending: number;
  accepted: number;
  rejected: number;
  capacity: number;
  ratio: number;
};

export type StatsDailyPoint = {
  date: string; // ISO yyyy-MM-dd
  submittedCount: number;
};

export type StatsFunnel = {
  submitted: number;
  documentPassed: number;
  interviewEntered: number | null;
  accepted: number;
};