'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDateTimeKst, useApplicantPhoneMutation } from '@duing/hooks';
import type { ApplicantDetail } from '@duing/types';
import { COLLEGE_DISPLAY_NAME, GRADE_DISPLAY_NAME } from '@duing/types';
import { ButtonSpinner } from '@/components/loading/Spinner';

/**
 * 기본은 마스킹. 운영진이 [번호 보기]를 누른 경우에만 원본을 조회해 표시하고, 그때만 복사를 연다.
 * MemberDetailPanel.ContactValue 와 같은 구조를 복제했다(스펙 원칙: 공용화 금지) — 대상이 부원(memberId)이 아니라
 * 지원서(applicationId)라 훅·응답 타입이 다르다. 노출 상태는 로컬이라 다른 지원자로 넘어가면(재마운트) 사라진다.
 * 클립보드에 들어가는 값은 조회한 원본뿐이다 — 마스킹 문자열을 복사하는 경로는 만들지 않는다.
 */
function ApplicantPhoneValue({
  applicationId,
  phoneMasked,
}: {
  applicationId: number;
  phoneMasked: string | null;
}) {
  const revealPhone = useApplicantPhoneMutation();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
    };
  }, []);

  async function reveal() {
    setError(null);
    try {
      const result = await revealPhone.mutateAsync(applicationId);
      setRevealed(result.phone);
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : '연락처를 불러오지 못했어요');
    }
  }

  async function copy() {
    if (revealed === null) return;
    setError(null);
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
      if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
      copyResetTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('복사에 실패했어요');
    }
  }

  // 번호가 없는 지원자는 서버가 phoneMasked 를 null 로 내린다 — 열람 버튼 없이 빈 값만(부원 ContactValue 와 동일).
  if (!phoneMasked) return <span className="text-charcoal-3">—</span>;

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="tabular-nums">{revealed ?? phoneMasked}</span>
        {revealed === null && (
          // 44px 히트는 -my-2 로 되돌려 dl 행 높이 증가를 최소화한다(MyEvaluationCard 전례).
          <button
            type="button"
            onClick={reveal}
            disabled={revealPhone.isPending}
            aria-label="휴대폰 번호 보기"
            className="-my-2 inline-flex min-h-11 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-charcoal-2 transition-colors hover:bg-sage-tint hover:text-ink disabled:opacity-60"
          >
            {revealPhone.isPending && <ButtonSpinner />}번호 보기
          </button>
        )}
        {revealed !== null && (
          <button
            type="button"
            onClick={copy}
            // 보이는 라벨이 복사 ↔ 복사됨 으로 바뀌므로 접근가능 이름도 같이 바꾼다.
            aria-label={copied ? '연락처 복사됨' : '연락처 복사'}
            className="-my-2 inline-flex min-h-11 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-charcoal-2 transition-colors hover:bg-sage-tint hover:text-ink"
          >
            {copied ? '복사됨' : '복사'}
          </button>
        )}
      </span>
      {error && <span className="text-xs text-coral">{error}</span>}
    </span>
  );
}

export function ApplicantProfilePanel({ detail }: { detail: ApplicantDetail }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-base font-semibold text-ink">지원자 정보</h2>
      {/* 고정 2열(50%)은 320px 에서 값 컬럼이 144px 로 좁아져 '단과대 · 전공' 이 넘친다.
          라벨은 내용폭, 값은 나머지 전부 + minmax(0)으로 그리드 블로우아웃 차단. */}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt className="text-charcoal-3">이름</dt>
        <dd className="break-words text-charcoal-2">{detail.applicant.name}</dd>

        <dt className="text-charcoal-3">학번</dt>
        <dd className="break-words text-charcoal-2">{detail.applicant.studentId}</dd>

        <dt className="text-charcoal-3">학과</dt>
        <dd className="break-words text-charcoal-2">
          {COLLEGE_DISPLAY_NAME[detail.applicant.college]} · {detail.applicant.major}
        </dd>

        <dt className="text-charcoal-3">학년</dt>
        <dd className="break-words text-charcoal-2">{GRADE_DISPLAY_NAME[detail.applicant.grade]}</dd>

        <dt className="text-charcoal-3">휴대폰</dt>
        <dd className="break-words text-charcoal-2">
          <ApplicantPhoneValue
            key={detail.applicationId}
            applicationId={detail.applicationId}
            phoneMasked={detail.applicant.phoneMasked}
          />
        </dd>

        <dt className="text-charcoal-3">지원일시</dt>
        <dd className="break-words text-charcoal-2">
          {formatDateTimeKst(detail.submittedAt)}
        </dd>

        {detail.interview && (
          <>
            <dt className="text-charcoal-3">면접일정</dt>
            <dd className="break-words text-charcoal-2">
              {formatDateTimeKst(detail.interview.startAt)}
              {detail.interview.location && ` · ${detail.interview.location}`}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}
