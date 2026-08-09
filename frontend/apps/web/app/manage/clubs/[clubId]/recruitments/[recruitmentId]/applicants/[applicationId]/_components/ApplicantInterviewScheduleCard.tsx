'use client';

import Link from 'next/link';

import { toRoute } from '@/app/_lib/route';
import { cn } from '@/app/_lib/cn';
import { formatSlotLabel } from '@/components/interview/_utils/localDateTime';
import {
  ROUND_STATUS_LABEL,
  ROUND_STATUS_BADGE_CLASS,
} from '@/components/interview/interviewRoundStatusLabels';

import type { ApplicationStatus, AvailabilityItem, InterviewRoundBrief } from '@duing/types';

// 운영진 지원자 상세 화면의 "면접" 카드 (BE#14 · FE#6).
// - 터미널(ACCEPTED/REJECTED) + 라운드 null → 미렌더(null)
// - 터미널 + 라운드 있음 → 정상 렌더 (면접 기록 보존 — 확정 슬롯 표시)
// - 라운드 있음 (비터미널): 라운드 제목·단계 칩·멤버 상태·[면접 관리에서 조정 →] 딥링크 + 선택 시간 목록
// - 라운드 null + INTERVIEW_PENDING: 대기열 안내 + [면접 관리] 링크
// - 라운드 null + 그 외 (비터미널 — SUBMITTED / ON_HOLD): 선정 전 안내

type Props = {
  interviewRound: InterviewRoundBrief | null;
  interviewAvailabilities: AvailabilityItem[];
  assignedSlot: AvailabilityItem | null;
  clubId: number;
  recruitmentId: number;
  applicationStatus: ApplicationStatus;
};

export function ApplicantInterviewScheduleCard({
  interviewRound,
  interviewAvailabilities,
  assignedSlot,
  clubId,
  recruitmentId,
  applicationStatus,
}: Props) {
  const isTerminalStatus = applicationStatus === 'ACCEPTED' || applicationStatus === 'REJECTED';

  // ── 터미널 + 라운드 null → 면접 이력 없음, 미렌더 ──────────────────────────
  if (isTerminalStatus && interviewRound === null) {
    return null;
  }

  // ── 라운드 있음 (터미널 포함 — 기록 보존) ───────────────────────────────

  if (interviewRound !== null) {
    const { roundId, title, roundStatus, memberStatus, unresponded, alternativeAvailabilityText } =
      interviewRound;

    const roundHref = toRoute(
      `/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview/rounds/${roundId}`,
    );

    return (
      <section className="card p-4">
        {/* 헤더 */}
        <header className="mb-3 flex items-start justify-between gap-2">
          {/* min-w-0: 라운드 제목은 운영진이 자유 입력하는 값이라 길면 flex 아이템의 기본
              min-width:auto 때문에 헤더를 넓히고 링크를 밀어낸다. 제목만 줄바꿈시킨다. */}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium',
                ROUND_STATUS_BADGE_CLASS[roundStatus],
              )}
            >
              {ROUND_STATUS_LABEL[roundStatus]}
            </span>
            <h2 className="min-w-0 break-words text-base font-semibold text-ink">{title}</h2>
          </div>
          {/* 장식 화살표는 aria-label 이 이미 accname 에서 빼고 있다(WCAG 2.5.3 — 가시 텍스트 포함). */}
          <Link href={roundHref} aria-label="면접 관리에서 조정" className={ROUND_LINK_CLASS}>
            면접 관리에서 조정 →
          </Link>
        </header>

        {/* 멤버 상태 행 */}
        <MemberStatusRow
          memberStatus={memberStatus}
          unresponded={unresponded}
          alternativeAvailabilityText={alternativeAvailabilityText}
          selectedCount={interviewAvailabilities.length}
        />

        {/* 현재 배정 + 선택 시간 목록 */}
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="text-xs text-charcoal-3">현재 배정</dt>
            <dd className="mt-1 text-sm text-charcoal-2">
              {assignedSlot ? formatSlotLabel(assignedSlot) : '미배정'}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-charcoal-3">
              지원자가 선택한 면접 가능 시간 ({interviewAvailabilities.length}개)
            </dt>
            <dd className="mt-1">
              {interviewAvailabilities.length === 0 ? (
                <p className="text-sm text-charcoal-3">아직 선택하지 않았습니다</p>
              ) : (
                <ul
                  aria-label="지원자가 선택한 면접 가능 시간"
                  className="space-y-1"
                >
                  {interviewAvailabilities.map((item) => {
                    const isAssigned = assignedSlot?.slotId === item.slotId;
                    return (
                      <li
                        key={item.slotId}
                        className="flex items-center gap-2 text-sm text-charcoal-2"
                      >
                        <span>{formatSlotLabel(item)}</span>
                        {isAssigned && (
                          <span className="pill pill-sky shrink-0 px-2 py-0.5 text-[11px]">
                            현재 배정
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      </section>
    );
  }

  // ── 라운드 null + INTERVIEW_PENDING ─────────────────────────────────────

  if (applicationStatus === 'INTERVIEW_PENDING') {
    const interviewHref = toRoute(
      `/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview`,
    );

    return (
      <section className="card p-4">
        <h2 className="mb-2 text-base font-semibold text-ink">면접 일정</h2>
        <p className="text-sm text-charcoal-2">
          면접 대기열에 있음 — 다음 라운드 선정을 기다립니다
        </p>
        <Link href={interviewHref} className={cn(ROUND_LINK_CLASS, 'mt-3')}>
          면접 관리
        </Link>
      </section>
    );
  }

  // ── 라운드 null + 그 외 (SUBMITTED / ON_HOLD) ───────────────────────────

  return (
    <section className="card p-4">
      <h2 className="mb-2 text-base font-semibold text-ink">면접 일정</h2>
      <p className="text-sm text-charcoal-2">
        면접 대상 선정 전 — 면접 관리의 라운드 만들기에서 선정합니다
      </p>
    </section>
  );
}

/**
 * 면접 관리로 나가는 두 딥링크의 공통 외형 — 44px 히트 영역(min-h-11)과 한 줄 유지(btn-sm)를 함께 건다.
 * .btn 은 inline-flex/items-center 와 focus-visible outline 을 이미 제공하므로 포커스 클래스를 따로 붙이지 않는다.
 * shrink-0 은 라운드 헤더에서 긴 제목이 링크를 찌그러뜨리는 것을 막는다(라운드 null 분기에서는 무해한 no-op).
 */
const ROUND_LINK_CLASS = 'btn btn-secondary btn-sm inline-flex min-h-11 shrink-0 items-center';

// ── 멤버 상태 행 ────────────────────────────────────────────────────────────

type MemberStatusRowProps = {
  memberStatus: InterviewRoundBrief['memberStatus'];
  unresponded: boolean;
  alternativeAvailabilityText: string | null;
  selectedCount: number;
};

function MemberStatusRow({
  memberStatus,
  unresponded,
  alternativeAvailabilityText,
  selectedCount,
}: MemberStatusRowProps) {
  // pill 매핑 기준은 "기존 색이 전달하던 의미" 다. 색을 쓰던 두 분기만 pill 로 옮긴다 —
  // rose(경고) → pill-coral, slate(중립) → 기본 pill. 나머지 네 분기는 원래 색 없는 본문 문장이라
  // pill 로 승격하면 없던 심각도 신호가 생기므로 토큰만 바꾸고 문장으로 남긴다.
  if (memberStatus === 'INVITED') {
    if (unresponded) {
      return <p className="pill pill-coral px-2 py-0.5 text-[11px]">미응답</p>;
    }
    return <p className="text-sm text-charcoal-2">응답 대기</p>;
  }

  if (memberStatus === 'RESPONDED') {
    return (
      <p className="text-sm text-charcoal-2">
        응답 완료 — 선택 {selectedCount}개
      </p>
    );
  }

  if (memberStatus === 'NO_AVAILABLE_SLOT') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-charcoal-2">가능한 시간 없음</p>
        {alternativeAvailabilityText && (
          // 지원자 자유 입력이라 공백 없는 긴 문자열이 올 수 있다 — break-words 로 320px 가로 스크롤을 막는다.
          <blockquote
            aria-label="지원자가 작성한 대체 가능 시간 설명"
            className="rounded-sm border-l-4 border-line bg-graysoft px-3 py-2 text-sm italic break-words text-charcoal-2"
          >
            {alternativeAvailabilityText}
          </blockquote>
        )}
      </div>
    );
  }

  if (memberStatus === 'ASSIGNED') {
    return <p className="text-sm text-charcoal-2">면접 확정</p>;
  }

  if (memberStatus === 'EXCLUDED') {
    return <p className="pill px-2 py-0.5 text-[11px]">라운드 제외</p>;
  }

  // exhaustive check — 새 union 멤버 추가 시 컴파일 에러로 누락 감지
  ((_: never) => {})(memberStatus);
  return null;
}
