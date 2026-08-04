export type StatsSummary = {
  total: number;
  submitted: number;
  onHold: number;
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
  interviewEntered: number | null;
  accepted: number;
};