import { addDaysIso } from '@duing/hooks';

import { monthDayLabel } from '@/app/admin/_components/home/adminPendingTrendPresentation';
import { ADMIN_TRIAGE_AREA_LABEL, ADMIN_TRIAGE_TILES } from '@/app/admin/_components/home/adminTriagePresentation';

import { mondayOf } from './briefingWeek';

import type { AdminWeeklyBriefing } from '@duing/types';

type WeeklyEndPending = NonNullable<AdminWeeklyBriefing['endPending']>;
type EndPendingKey = Exclude<keyof WeeklyEndPending, 'totalPendingCount'>;
export type WeeklyFlowKey = keyof AdminWeeklyBriefing['flow'];

/** 학기 정보 확인 기록이 생긴 주(V134 운영 반영 10/21 의 주 월요일) — 이 주보다 이른 주는 숫자 대신 "—". */
export const PROFILE_CHECK_RECORDED_SINCE = '2026-10-19';

/** 업무 표 다섯 줄 — 이름은 홈 라벨(ADMIN_TRIAGE_AREA_LABEL), 주 끝 남은 대기는 같은 영역의 대기 칸이다. */
export const WEEKLY_FLOW_ROWS: ReadonlyArray<{ key: WeeklyFlowKey; label: string; endPendingKey: EndPendingKey }> = [
  { key: 'report', label: ADMIN_TRIAGE_AREA_LABEL.REPORT, endPendingKey: 'reportUnresolved' },
  { key: 'inquiry', label: ADMIN_TRIAGE_AREA_LABEL.INQUIRY, endPendingKey: 'inquiryUnanswered' },
  { key: 'facilityBooking', label: ADMIN_TRIAGE_AREA_LABEL.FACILITY, endPendingKey: 'facilityBooking' },
  { key: 'promotionRequest', label: ADMIN_TRIAGE_AREA_LABEL.PROMOTION, endPendingKey: 'promotionRequest' },
  { key: 'leaderSuccession', label: ADMIN_TRIAGE_AREA_LABEL.SUCCESSION, endPendingKey: 'leaderSuccession' },
];

/** 미처리 지원은 대기 단위가 모집이라 칸 라벨('미처리 지원 모집')을 쓴다. */
const RECRUITMENT_TILE_LABEL =
  ADMIN_TRIAGE_TILES.find((tile) => tile.key === 'RECRUITMENT')?.label ?? ADMIN_TRIAGE_AREA_LABEL.RECRUITMENT;

/** "그 밖의 대기(남은 것만)" 세 줄 — 접수·처리는 세지 않는다. */
export const OTHER_PENDING_ROWS: ReadonlyArray<{ label: string; endPendingKey: EndPendingKey }> = [
  { label: ADMIN_TRIAGE_AREA_LABEL.CLUB_APPROVAL, endPendingKey: 'clubApproval' },
  { label: RECRUITMENT_TILE_LABEL, endPendingKey: 'stalePendingRecruitment' },
  { label: ADMIN_TRIAGE_AREA_LABEL.INACTIVE_CLUB, endPendingKey: 'inactiveClubPending' },
];

export const FLOW_SCOPE_LINE = "접수·처리는 월요일 0시~일요일 24시에 일어난 건만 세요(홈 '최근 7일'과 다를 수 있어요).";
export const FLOW_DRIFT_LINE =
  '신청 취소·삭제는 처리로 세지 않아 남은 대기 증감과 맞지 않을 수 있어요. 나중에 삭제된 건은 빠져서, 지난 주 숫자가 조금 바뀔 수 있어요.';
export const ACTIVITY_DRIFT_LINE = '기간 종료일 수정·청구 취소·졸업 반영 등으로 지난 주 숫자가 바뀔 수 있어요.';
export const QUIET_WEEK_SENTENCE = '이 주에는 접수된 업무와 새 모집이 없었어요.';
export const PREVIOUS_WEEK_FAILED_TEXT = '전 주 숫자를 불러오지 못해 비교를 뺐어요.';
export const WEEK_LOAD_FAILED_TEXT = '이 주 지표를 불러오지 못했어요';
export const OLDEST_WEEK_TEXT = '1년 전까지만 볼 수 있어요';

export type Delta = { visible: string; spoken: string };

/** 전 주 같은 칸 대비 — 좋고 나쁨을 칠하지 않는 중립 표기, % 없음. 전 주 값이 없으면 null(증감을 뺀다). */
export function deltaOf(current: number, previous: number | null | undefined, unit: '건' | '곳' | '명'): Delta | null {
  if (previous === null || previous === undefined) return null;
  const difference = current - previous;
  if (difference === 0) return { visible: '같음', spoken: '전 주와 같음' };
  return difference > 0
    ? { visible: `+${difference}`, spoken: `전 주보다 ${difference}${unit} 많음` }
    : { visible: `−${-difference}`, spoken: `전 주보다 ${-difference}${unit} 적음` };
}

/** 첫 답변까지 평균(API 는 분) — 60분 미만 "1시간 미만", 48시간 미만은 시간(반올림), 그 이상은 일(반올림). */
export function firstAnswerDurationText(averageMinutes: number): string {
  if (averageMinutes < 60) return '1시간 미만';
  const hours = averageMinutes / 60;
  if (hours < 48) return `${Math.round(hours)}시간`;
  return `${Math.round(hours / 24)}일`;
}

/** 1:1 문의 줄 아래 보조 줄 — 그 주 답변이 0건이면 줄을 뺀다. */
export function firstAnswerLine(firstAnswer: AdminWeeklyBriefing['inquiryFirstAnswer']): string | null {
  if (firstAnswer.answerCount === 0 || firstAnswer.averageMinutes === null) return null;
  return `첫 답변까지 평균 ${firstAnswerDurationText(firstAnswer.averageMinutes)} (답변 ${firstAnswer.answerCount}건 기준)`;
}

/** 일요일 기록이 없을 때 '주 끝 남은 대기' 열 자리의 이유 한 줄. */
export function endPendingAbsenceText(weekStart: string, pendingRecordStartedOn: string | null): string {
  const sunday = addDaysIso(weekStart, 6);
  if (pendingRecordStartedOn === null) return '주 끝 남은 대기는 아직 기록이 없어요.';
  if (sunday < pendingRecordStartedOn) {
    return `주 끝 남은 대기는 ${monthDayLabel(mondayOf(pendingRecordStartedOn))} 주부터 기록돼 있어요.`;
  }
  return `${monthDayLabel(sunday)}(일) 밤 기록이 없어 남은 대기를 보여 드릴 수 없어요.`;
}

/** 한글 마지막 글자에 받침이 있는가 — 한글이 아니면 받침 없음으로 본다. */
function hasFinalConsonant(word: string): boolean {
  const syllableOffset = word.charCodeAt(word.length - 1) - 0xac00;
  return syllableOffset >= 0 && syllableOffset <= 11171 && syllableOffset % 28 !== 0;
}
const withSubjectParticle = (word: string) => `${word}${hasFinalConsonant(word) ? '이' : '가'}`;
const withAndParticle = (word: string) => `${word}${hasFinalConsonant(word) ? '과' : '와'}`;

/** "신고와 1:1 문의" / "신고, 1:1 문의와 시설 예약" — 마지막 앞 낱말에만 와/과를 붙인다. */
function joinWithAnd(words: readonly string[]): string {
  const last = words.at(-1) ?? '';
  const leading = words.slice(0, -1);
  if (leading.length === 0) return last;
  const leadingText = leading.map((word, index) => (index === leading.length - 1 ? withAndParticle(word) : `${word},`)).join(' ');
  return `${leadingText} ${last}`;
}

/** 비교 동사는 홈 pendingTrendSummary 말투 — 늘었어요/줄었어요/같아요. */
function comparisonClause(current: number, previous: number): string {
  const difference = current - previous;
  if (difference === 0) return '전 주와 같아요';
  return difference > 0 ? `전 주보다 ${difference}건 늘었어요` : `전 주보다 ${-difference}건 줄었어요`;
}

function endPendingSentence(sundayLabel: string, total: number, previousTotal: number | null): string {
  const head = `${sundayLabel}(일) 밤 남은 처리 대기는 ${total}건`;
  return previousTotal === null ? `${head}이에요.` : `${head}으로, ${comparisonClause(total, previousTotal)}.`;
}

function busiestAreaSentence(current: AdminWeeklyBriefing): string | null {
  const counts = WEEKLY_FLOW_ROWS.map((row) => ({ label: row.label, count: current.flow[row.key].receivedCount }));
  const maxCount = Math.max(...counts.map((entry) => entry.count));
  if (maxCount <= 1) return null;
  const labels = counts.filter((entry) => entry.count === maxCount).map((entry) => entry.label);
  const phrase = joinWithAnd([...labels.slice(0, -1), withSubjectParticle(labels.at(-1) ?? '')]);
  return labels.length === 1
    ? `${phrase} ${maxCount}건으로 가장 많이 접수됐어요.`
    : `${phrase} ${maxCount}건씩 가장 많이 접수됐어요.`;
}

function recruitmentSentence(current: AdminWeeklyBriefing, previous: AdminWeeklyBriefing | null): string | null {
  const { createdCount, endedCount, applicationCount } = current.recruitment;
  const parts: string[] = [];
  if (createdCount > 0 && endedCount > 0) parts.push(`모집 ${createdCount}건이 새로 등록되고 ${endedCount}건의 모집 기간이 끝났어요.`);
  else if (createdCount > 0) parts.push(`모집 ${createdCount}건이 새로 등록됐어요.`);
  else if (endedCount > 0) parts.push(`${endedCount}건의 모집 기간이 끝났어요.`);
  if (applicationCount > 0) {
    const comparison = previous ? `(${comparisonClause(applicationCount, previous.recruitment.applicationCount)})` : '';
    parts.push(`지원서는 ${applicationCount}건이에요${comparison}.`);
  }
  return parts.length === 0 ? null : parts.join(' ');
}

function inquirySentence(current: AdminWeeklyBriefing): string | null {
  const { receivedCount, handledCount } = current.flow.inquiry;
  if (receivedCount === 0 && handledCount === 0) return null;
  const head = `1:1 문의는 ${receivedCount}건 접수, ${handledCount}건 처리했어요.`;
  const { answerCount, averageMinutes } = current.inquiryFirstAnswer;
  return answerCount > 0 && averageMinutes !== null
    ? `${head} 첫 답변까지 평균 ${firstAnswerDurationText(averageMinutes)}이에요.`
    : head;
}

/**
 * 한 주 요약(규칙 문장, AI 생성 아님) — 순서 고정 1→4, 데이터 없는 문장은 뺀다.
 * 0 판정(다섯 업무 접수·처리 + 새 모집 + 지원서가 모두 0)이면 2~4번 대신 한 문장, 1번은 기록이 있을 때만 남긴다.
 */
export function weeklySummarySentences(
  weekStart: string,
  current: AdminWeeklyBriefing,
  previous: AdminWeeklyBriefing | null,
): string[] {
  const flows = WEEKLY_FLOW_ROWS.map((row) => current.flow[row.key]);
  const receivedTotal = flows.reduce((total, flow) => total + flow.receivedCount, 0);
  const handledTotal = flows.reduce((total, flow) => total + flow.handledCount, 0);
  const isQuietWeek =
    receivedTotal + handledTotal + current.recruitment.createdCount + current.recruitment.applicationCount === 0;
  const sentences: string[] = [];
  if (current.endPending) {
    sentences.push(
      endPendingSentence(
        monthDayLabel(addDaysIso(weekStart, 6)),
        current.endPending.totalPendingCount,
        previous?.endPending?.totalPendingCount ?? null,
      ),
    );
  } else if (!isQuietWeek) {
    sentences.push(`다섯 업무에 접수 ${receivedTotal}건, 처리 ${handledTotal}건이에요.`);
  }
  if (isQuietWeek) return [...sentences, QUIET_WEEK_SENTENCE];
  for (const sentence of [busiestAreaSentence(current), recruitmentSentence(current, previous), inquirySentence(current)]) {
    if (sentence !== null) sentences.push(sentence);
  }
  return sentences;
}

const dateParts = (isoDate: string) => {
  const [year = 0, month = 0, day = 0] = isoDate.split('-').map(Number);
  return { year, month, day };
};

/** 주 기간 — 같은 달이면 끝에 일만, 달이 바뀌면 월도, 해를 넘으면 양끝에 연도를 쓴다. */
export function formatWeekRange(weekStart: string, options: { withYear: boolean; withWeekday: boolean }): string {
  const start = dateParts(weekStart);
  const end = dateParts(addDaysIso(weekStart, 6));
  const crossesYear = start.year !== end.year;
  const startText = `${options.withYear || crossesYear ? `${start.year}년 ` : ''}${start.month}월 ${start.day}일${options.withWeekday ? '(월)' : ''}`;
  const endText = crossesYear
    ? `${end.year}년 ${end.month}월 ${end.day}일`
    : end.month !== start.month
      ? `${end.month}월 ${end.day}일`
      : `${end.day}일`;
  return `${startText} – ${endText}${options.withWeekday ? '(일)' : ''}`;
}

/** 화면 기간 — 올해(KST 오늘의 해)가 아닌 주는 연도를 쓴다. 인쇄 머리는 formatWeekRange(withYear: true). */
export function screenWeekRange(weekStart: string, todayIso: string, withWeekday = true): string {
  return formatWeekRange(weekStart, { withYear: dateParts(weekStart).year !== dateParts(todayIso).year, withWeekday });
}

/** 가장 최근 주에서 '다음 주' 버튼 옆 이유 — 이번 주가 끝나는 다음 월요일. */
export function nextWeekUnavailableText(currentMonday: string): string {
  return `이번 주는 ${monthDayLabel(addDaysIso(currentMonday, 7))}(월)부터 볼 수 있어요`;
}
