/**
 * 신규 모집 작성 폼의 로컬 임시저장 — 작성 중 이탈(새로고침·오탭 닫기)에서 입력을 되살린다.
 * 서버에 저장하지 않으므로 같은 브라우저에서만 유효하고, 동아리별로 한 벌만 둔다.
 */
export type RecruitmentDraftValues = Partial<{
  title: string;
  content: string;
  startDate: string;
  endDate: string;
  isAlwaysOpen: boolean;
  capacity: number;
  applicationMode: 'SELF' | 'EXTERNAL';
  externalFormUrl: string;
  useInterview: boolean;
  interviewStartDate: string;
  interviewEndDate: string;
  showApplicantCount: boolean;
  targetRole: 'MEMBER' | 'OFFICER';
  questionItems: unknown[];
}>;

export type RecruitmentDraft = { values: RecruitmentDraftValues; savedAt: number };

const key = (clubId: number) => `duing:recruitment-draft:${clubId}`;

// infoMenu.ts 와 같은 try/catch 정책 — localStorage 차단·손상은 기능 저하(임시저장 없음)로만 남긴다.
export function saveRecruitmentDraft(clubId: number, values: RecruitmentDraftValues): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      key(clubId),
      JSON.stringify({ values, savedAt: Date.now() } satisfies RecruitmentDraft),
    );
  } catch {
    // 차단·용량 초과 — 임시저장만 포기하고 작성은 그대로 진행한다.
  }
}

export function loadRecruitmentDraft(clubId: number): RecruitmentDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key(clubId));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('values' in parsed) || !('savedAt' in parsed)) {
      return null;
    }
    return parsed as RecruitmentDraft;
  } catch {
    return null;
  }
}

export function clearRecruitmentDraft(clubId: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key(clubId));
  } catch {
    // 위와 동일 — 지우지 못해도 다음 저장이 덮어쓴다.
  }
}
