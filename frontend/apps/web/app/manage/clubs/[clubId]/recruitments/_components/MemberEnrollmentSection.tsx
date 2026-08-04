'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  formatDateKst,
  parseKstInstant,
  useActiveJoinCodeQuery,
  useClubDetailQuery,
  useCreateJoinCodeMutation,
  useJoinRequestsQuery,
  useRevokeJoinCodeMutation,
} from '@duing/hooks';
import type { JoinCodeSummary } from '@duing/types';

import { ButtonSpinner } from '@/components/loading/Spinner';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';
import { toRoute } from '@/app/_lib/route';
import { MemberEnrollmentStepsCard } from '../../_components/MemberEnrollmentStepsCard';

/**
 * 외부 폼(EXTERNAL) 모집의 회원 등록 영역 (스펙 §5). 코드는 모집에 귀속되므로 클럽 단위였던
 * 회원 초대 다이얼로그의 코드 관리 UI 가 이 자리로 옮겨왔다. 모집 상태(OPEN/CLOSED)는 발급
 * 조건이 아니므로(§4.2) 상태와 무관하게 항상 렌더한다 — 자체 폼 모집에서는 호출부가 감춘다.
 */
type MemberEnrollmentSectionProps = {
  clubId: number;
  recruitmentId: number;
};

const EXPIRY_OPTIONS = [7, 30, 90] as const;
const DEFAULT_EXPIRY_DAYS = 30;

// 스펙 §8·§9 문안 — 차감 정책 안내는 코드 유무와 무관하게, 유출 경고는 복사 버튼 옆에 붙인다.
const DEDUCTION_NOTICE =
  '가입 요청이 생성되는 즉시 사용 가능 인원이 차감됩니다. 운영진이 가입 요청을 거절하면 자동으로 ' +
  '사용 가능 인원이 복구됩니다. 링크가 외부에 유출될 경우 승인 여부와 관계없이 가입 요청이 생성된 ' +
  '횟수만큼 사용 가능 인원이 일시적으로 감소할 수 있습니다.';

const LEAK_WARNING =
  '⚠️ 가입 코드는 합격자에게만 공유해주세요. 링크가 외부에 유출되면 제3자가 가입 요청을 생성할 수 ' +
  '있으며, 가입 요청이 생성될 때마다 사용 가능 인원이 일시적으로 차감됩니다. 잘못 생성된 가입 요청은 ' +
  '운영진이 거절하면 자동으로 복구됩니다.';

const fieldCls =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function MemberEnrollmentSection({ clubId, recruitmentId }: MemberEnrollmentSectionProps) {
  const activeCodeQuery = useActiveJoinCodeQuery(clubId, recruitmentId);
  // 기수를 쓰지 않는 동아리에는 기수 입력을 감춘다 — 코드에 붙는 기수 스냅샷도 의미가 없다.
  const { data: clubDetail } = useClubDetailQuery(clubId);
  const useGeneration = clubDetail?.useGeneration ?? false;
  // 대기 건수 배지. 실패해도 배지만 빠지고 화면은 그대로다(로딩 게이트에 넣지 않는다).
  const { data: pendingJoinRequests } = useJoinRequestsQuery(clubId, 'PENDING');
  const pendingCount = pendingJoinRequests?.length ?? 0;

  return (
    <section
      aria-labelledby="member-enrollment-heading"
      className="mt-8 rounded-lg border border-line bg-paper p-5"
    >
      <h2 id="member-enrollment-heading" className="text-base font-bold text-ink-deep">
        회원 등록
      </h2>
      <p className="mt-1 text-sm text-charcoal-3">
        외부 폼으로 뽑은 합격자에게 가입 코드를 전달하면, 학생이 직접 가입 요청을 보낼 수 있어요.
      </p>

      <div className="mt-4">
        <MemberEnrollmentStepsCard />
      </div>

      <div className="mt-4">
        {activeCodeQuery.isLoading && (
          <LoadingGate label="가입 코드 불러오는 중" className="min-h-0 py-10" />
        )}
        {activeCodeQuery.isError && (
          <p role="alert" className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">
            {extractErrorMessage(activeCodeQuery.error) ?? '가입 코드를 불러오지 못했어요.'}
          </p>
        )}
        {activeCodeQuery.isSuccess &&
          (activeCodeQuery.data === null ? (
            <CreateCodeForm
              clubId={clubId}
              recruitmentId={recruitmentId}
              useGeneration={useGeneration}
            />
          ) : (
            <ActiveCodeCard
              // 재생성으로 코드가 바뀌면 카드를 새로 마운트한다 — 안 그러면 재생성 폼 상태가 남아
              // 새 코드가 이미 발급됐는데도 폼이 계속 보인다.
              key={activeCodeQuery.data.joinCodeId}
              clubId={clubId}
              recruitmentId={recruitmentId}
              joinCode={activeCodeQuery.data}
              useGeneration={useGeneration}
            />
          ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-charcoal-3">{DEDUCTION_NOTICE}</p>

      <Link
        href={toRoute(`/manage/clubs/${clubId}/members/requests`)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-charcoal-2 hover:border-ink hover:text-ink"
      >
        가입 요청 관리
        {pendingCount > 0 && (
          <span className="rounded-full bg-coral px-1.5 py-0.5 text-xs font-semibold text-paper">
            {pendingCount}
          </span>
        )}
      </Link>
    </section>
  );
}

function CreateCodeForm({
  clubId,
  recruitmentId,
  useGeneration,
}: {
  clubId: number;
  recruitmentId: number;
  useGeneration: boolean;
}) {
  const createJoinCode = useCreateJoinCodeMutation(clubId, recruitmentId);
  const [maxUses, setMaxUses] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(String(DEFAULT_EXPIRY_DAYS));
  const [generation, setGeneration] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const parsedMaxUses = Number(maxUses.trim());
    if (!/^\d+$/.test(maxUses.trim()) || parsedMaxUses < 1 || parsedMaxUses > 500) {
      setError('최대 사용 인원은 1~500 사이로 입력해주세요.');
      return;
    }
    const trimmedGeneration = generation.trim();
    if (trimmedGeneration !== '' && (!/^\d+$/.test(trimmedGeneration) || Number(trimmedGeneration) < 1)) {
      setError('기수는 1 이상의 정수여야 해요.');
      return;
    }
    setError(null);
    try {
      await createJoinCode.mutateAsync({
        maxUses: parsedMaxUses,
        expiresInDays: Number(expiresInDays),
        // 기수 미입력은 필드 자체를 보내지 않는다 — BE 가 null 을 "기수 없음" 으로 저장한다.
        ...(trimmedGeneration === '' ? {} : { generation: Number(trimmedGeneration) }),
      });
    } catch (createFailure) {
      // 409 는 두 종류(자체 폼 모집 / 동시 재생성)라 문구를 프론트에서 짜지 않고 서버 메시지를 그대로 쓴다.
      setError(extractErrorMessage(createFailure) ?? '가입 코드를 만들지 못했어요.');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="join-code-max-uses" className="mb-1.5 block text-xs font-semibold text-charcoal-2">
          최대 사용 인원
        </label>
        <input
          id="join-code-max-uses"
          type="number"
          min={1}
          max={500}
          inputMode="numeric"
          value={maxUses}
          onChange={(event) => setMaxUses(event.target.value)}
          placeholder="예: 30"
          disabled={createJoinCode.isPending}
          className={fieldCls}
        />
        <p className="mt-1 text-xs text-charcoal-3">
          이 인원만큼 신청이 들어오면 코드는 더 이상 쓸 수 없어요. 거절하면 자리가 다시 열려요.
        </p>
      </div>

      <div>
        <label htmlFor="join-code-expiry" className="mb-1.5 block text-xs font-semibold text-charcoal-2">
          유효 기간
        </label>
        <select
          id="join-code-expiry"
          value={expiresInDays}
          onChange={(event) => setExpiresInDays(event.target.value)}
          disabled={createJoinCode.isPending}
          className={fieldCls}
        >
          {EXPIRY_OPTIONS.map((days) => (
            <option key={days} value={days}>
              {days}일
            </option>
          ))}
        </select>
      </div>

      {useGeneration && (
        <div>
          <label htmlFor="join-code-generation" className="mb-1.5 block text-xs font-semibold text-charcoal-2">
            기수 (선택)
          </label>
          <input
            id="join-code-generation"
            type="number"
            min={1}
            inputMode="numeric"
            value={generation}
            onChange={(event) => setGeneration(event.target.value)}
            placeholder="예: 12"
            disabled={createJoinCode.isPending}
            className={fieldCls}
          />
          <p className="mt-1 text-xs text-charcoal-3">이 코드로 가입한 회원에게 자동으로 찍힙니다.</p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">
          {error}
        </p>
      )}

      {/* 성공 후에도 활성 코드 재조회가 도착할 때까지는 폼이 그대로라, 재활성화하면 두 번째 클릭이
          방금 만든 코드를 폐기하고 새로 만든다(BE 원자 재생성). 성공하면 다시 열지 않는다. */}
      <button
        type="button"
        onClick={submit}
        disabled={createJoinCode.isPending || createJoinCode.isSuccess}
        className="btn btn-primary btn-sm w-full"
      >
        {(createJoinCode.isPending || createJoinCode.isSuccess) && <ButtonSpinner />}코드 만들기
      </button>
    </div>
  );
}

function ActiveCodeCard({
  clubId,
  recruitmentId,
  joinCode,
  useGeneration,
}: {
  clubId: number;
  recruitmentId: number;
  joinCode: JoinCodeSummary;
  useGeneration: boolean;
}) {
  const revokeJoinCode = useRevokeJoinCodeMutation(clubId, recruitmentId);
  const [confirming, setConfirming] = useState<'revoke' | 'regenerate' | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // 재생성은 "확인 → 생성 폼" 2단계다. 새 코드 생성이 곧 기존 코드 폐기(BE 원자 재생성)이므로
  // 여기서 따로 폐기 API 를 부르지 않는다 — 부르면 실패 시 코드 없는 상태로 남는다.
  const [regenerating, setRegenerating] = useState(false);

  // 오프셋 없는 문자열이 와도 KST 로 읽도록 공용 파서를 태운다(new Date 는 브라우저 로컬로 해석).
  const isExpired = parseKstInstant(joinCode.expiresAt).getTime() <= Date.now();

  async function revoke() {
    setDialogError(null);
    try {
      await revokeJoinCode.mutateAsync(joinCode.joinCodeId);
      setConfirming(null);
    } catch (revokeFailure) {
      // 실패하면 모달을 닫지 않는다 — 같은 자리에서 재시도할 수 있게 맥락을 유지한다.
      setDialogError(extractErrorMessage(revokeFailure) ?? '가입 코드를 폐기하지 못했어요.');
    }
  }

  if (regenerating) {
    return (
      <CreateCodeForm clubId={clubId} recruitmentId={recruitmentId} useGeneration={useGeneration} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-line bg-graysoft/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-xl font-bold tracking-widest text-ink-deep">{joinCode.code}</p>
          <div className="flex shrink-0 gap-1">
            <CopyButton label="코드 복사" value={joinCode.code} />
            <CopyButton label="초대 링크 복사" value={`${window.location.origin}/join/${joinCode.code}`} />
          </div>
        </div>

        {/* 유출 경고는 복사 버튼 바로 아래에 둔다 (스펙 §9) — 공유 직전에 읽히는 자리다. */}
        <p className="mt-3 rounded-md bg-coral/5 px-3 py-2 text-xs leading-relaxed text-coral">
          {LEAK_WARNING}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {isExpired && <Badge tone="warn">만료됨</Badge>}
          {joinCode.generation !== null && <Badge tone="muted">{joinCode.generation}기</Badge>}
        </div>

        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-charcoal-3">사용</dt>
            <dd className="text-ink-deep">
              {joinCode.usedCount} / {joinCode.maxUses}명
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-charcoal-3">만료</dt>
            <dd className="text-ink-deep">{formatDateKst(joinCode.expiresAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming('regenerate')}
          className="btn btn-ghost btn-sm flex-1"
        >
          코드 재생성
        </button>
        <button
          type="button"
          onClick={() => setConfirming('revoke')}
          className="btn btn-sm flex-1 text-coral hover:bg-coral/5"
        >
          코드 폐기
        </button>
      </div>

      <ConfirmDialog
        open={confirming === 'revoke'}
        title="가입 코드를 폐기할까요?"
        description="폐기하면 이 코드로는 더 이상 가입 요청을 보낼 수 없습니다. 이미 접수된 요청은 그대로 남습니다."
        confirmLabel="폐기"
        isPending={revokeJoinCode.isPending}
        errorMessage={dialogError}
        onConfirm={revoke}
        onCancel={() => {
          setConfirming(null);
          setDialogError(null);
        }}
      />

      <ConfirmDialog
        open={confirming === 'regenerate'}
        title="코드를 새로 만들까요?"
        description="기존 코드는 즉시 사용할 수 없게 됩니다. 이미 전달한 링크는 모두 무효가 됩니다."
        confirmLabel="새로 만들기"
        onConfirm={() => {
          setConfirming(null);
          setRegenerating(true);
        }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}

// 배색은 globals.css 의 pill 계열을 그대로 쓴다(pill 기본 = sage-mist/ink, pill-coral = 대비 맞춘 코랄).
function Badge({ tone, children }: { tone: 'warn' | 'muted'; children: ReactNode }) {
  return (
    <span className={tone === 'warn' ? 'pill pill-coral !px-2 !py-0.5' : 'pill !px-2 !py-0.5'}>
      {children}
    </span>
  );
}

/** 복사 성공은 라벨을 잠깐 "복사됨" 으로 바꿔 알린다(MemberDetailPanel 연락처 복사와 동일 규약). */
function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  async function copy() {
    setFailed(false);
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setFailed(true);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      // 보이는 라벨이 바뀌므로 접근가능 이름도 같이 바꾼다 — 고정이면 스크린리더가 성공을 못 읽는다.
      aria-label={copied ? `${label}됨` : failed ? `${label} 실패` : label}
      className="rounded-md px-2 py-1 text-xs font-medium text-charcoal-2 transition-colors hover:bg-sage-tint hover:text-ink"
    >
      {copied ? '복사됨' : failed ? '실패' : label}
    </button>
  );
}
