'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  formatDateTimeKst,
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
import { MemberEnrollmentStepsCard } from './MemberEnrollmentStepsCard';

/**
 * 외부 폼(EXTERNAL) 모집의 회원 등록 영역 (스펙 §5). 모집 상세와 모집 목록 카드의 [가입 링크]
 * 다이얼로그가 같은 화면을 써야 하므로, 내용을 가진 패널과 제목·테두리를 가진 섹션으로 나눠 둘 다 쓴다.
 * 생성·재생성은 모집이 실질 진행 중일 때만 가능하므로(§4.2) 그 판정은 호출부가 `canCreate` 로 넘긴다.
 */
type MemberEnrollmentProps = {
  clubId: number;
  recruitmentId: number;
  clubName: string;
  /** 모집이 실질 진행 중(effectivelyOpen)인가 — false 면 생성·재생성 UI 대신 안내를 보여준다. */
  canCreate: boolean;
};

// 가입 가능 기간 프리셋 (스펙 §4.3) — 절대 만료일 대신 모집 종료 시각 기준이며 직접 입력은 없다.
const JOIN_WINDOW_OPTIONS = [
  { days: 0, label: '모집 종료일까지' },
  { days: 7, label: '모집 종료 후 7일' },
  { days: 14, label: '모집 종료 후 14일' },
] as const;
const DEFAULT_JOIN_WINDOW_DAYS = 7;

// 스펙 §7.1 운영 정책 4줄 — 가입 링크 화면에 상시 노출한다.
const JOIN_LINK_POLICIES = [
  '가입 링크는 모집이 OPEN 상태일 때만 생성 및 재생성할 수 있습니다.',
  '모집 종료 후에는 기존 링크만 사용할 수 있습니다.',
  '가입 가능 기간이 종료되면 링크는 자동으로 만료됩니다.',
  '모집 종료 이후에는 새로운 가입 링크를 생성할 수 없습니다.',
];

const CLOSED_NOTICE = '모집이 진행 중일 때만 가입 링크를 만들 수 있습니다.';

// 스펙 §8·§9 문안 — 차감 정책 안내는 링크 유무와 무관하게, 유출 경고는 복사 버튼 옆에 붙인다.
const DEDUCTION_NOTICE =
  '가입 요청이 생성되는 즉시 사용 가능 인원이 차감됩니다. 운영진이 가입 요청을 거절하면 자동으로 ' +
  '사용 가능 인원이 복구됩니다. 링크가 외부에 유출될 경우 승인 여부와 관계없이 가입 요청이 생성된 ' +
  '횟수만큼 사용 가능 인원이 일시적으로 감소할 수 있습니다.';

const LEAK_WARNING =
  '⚠️ 가입 링크는 합격자에게만 공유해주세요. 링크가 외부에 유출되면 제3자가 가입 요청을 생성할 수 ' +
  '있으며, 가입 요청이 생성될 때마다 사용 가능 인원이 일시적으로 차감됩니다. 잘못 생성된 가입 요청은 ' +
  '운영진이 거절하면 자동으로 복구됩니다.';

// 스펙 §4.3.1 — 재생성이 불가능한 모집 종료 후 폐기에만 붙는 경고와 2단계(타이핑) 확인.
const REVOKE_AFTER_CLOSE_WARNING =
  '⚠️ 모집이 종료되어 새로운 가입 링크를 생성할 수 없습니다. 현재 링크를 폐기하면 남아있는 합격자도 ' +
  '가입할 수 없게 됩니다. 정말 폐기하시겠습니까?';
const REVOKE_CONFIRM_WORD = '폐기';

/** 스펙 §5.1 합격 안내 템플릿 — 문안은 그대로 두고 동아리명·링크만 채운다. */
function acceptanceMessage(clubName: string, joinLink: string): string {
  return (
    `🎉 축하드립니다! ${clubName} 최종 합격을 축하드립니다. 아래 링크를 통해 동아리 가입을 완료해 주세요. ` +
    `가입은 최초 1회만 필요하며, 가입 완료 후 정식 회원으로 등록됩니다. ${joinLink}`
  );
}

/** 가입 가능 기간 표시 — 모집 진행 중이면 프리셋 문구, 종료됐으면 실제 만료 일시(스펙 §4.3·§7.2). */
function joinWindowLabel(joinCode: JoinCodeSummary): string {
  if (joinCode.joinExpiresAt !== null) return `${formatDateTimeKst(joinCode.joinExpiresAt)}까지`;
  return joinCode.joinWindowDays === 0
    ? '모집 종료일까지'
    : `모집 종료 후 ${joinCode.joinWindowDays}일까지`;
}

/** 만료는 모집 종료 후에만 성립한다 — 진행 중이면 joinExpiresAt 이 null 이라 만료 자체가 없다. */
function isExpired(joinCode: JoinCodeSummary): boolean {
  return (
    joinCode.joinExpiresAt !== null &&
    parseKstInstant(joinCode.joinExpiresAt).getTime() <= Date.now()
  );
}

const fieldCls =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** 모집 상세용 — 제목과 테두리를 갖춘 섹션 껍데기. 내용은 패널이 전부 갖는다. */
export function MemberEnrollmentSection(props: MemberEnrollmentProps) {
  return (
    <section
      aria-labelledby="member-enrollment-heading"
      className="mt-8 rounded-lg border border-line bg-paper p-5"
    >
      <h2 id="member-enrollment-heading" className="text-base font-bold text-ink-deep">
        회원 등록
      </h2>
      <p className="mt-1 text-sm text-charcoal-3">
        외부 폼으로 뽑은 합격자에게 가입 링크를 전달하면, 학생이 직접 가입 요청을 보낼 수 있어요.
      </p>
      <div className="mt-4">
        <MemberEnrollmentPanel {...props} />
      </div>
    </section>
  );
}

export function MemberEnrollmentPanel({
  clubId,
  recruitmentId,
  clubName,
  canCreate,
}: MemberEnrollmentProps) {
  const activeCodeQuery = useActiveJoinCodeQuery(clubId, recruitmentId);
  // 기수를 쓰지 않는 동아리에는 기수 입력을 감춘다 — 링크에 붙는 기수 스냅샷도 의미가 없다.
  const { data: clubDetail } = useClubDetailQuery(clubId);
  const useGeneration = clubDetail?.useGeneration ?? false;
  // 동아리 전체 대기 건수 배지. 실패해도 배지만 빠지고 화면은 그대로다(로딩 게이트에 넣지 않는다).
  const { data: pendingJoinRequests } = useJoinRequestsQuery(clubId, 'PENDING');
  const clubPendingCount = pendingJoinRequests?.length ?? 0;

  return (
    <div>
      {activeCodeQuery.isLoading && (
        <LoadingGate label="가입 링크 불러오는 중" className="min-h-0 py-10" />
      )}
      {activeCodeQuery.isError && (
        <p role="alert" className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">
          {extractErrorMessage(activeCodeQuery.error) ?? '가입 링크를 불러오지 못했어요.'}
        </p>
      )}
      {activeCodeQuery.isSuccess &&
        (activeCodeQuery.data === null ? (
          canCreate ? (
            <CreateCodeForm
              clubId={clubId}
              recruitmentId={recruitmentId}
              useGeneration={useGeneration}
            />
          ) : (
            // 종료된 모집에서 생성 폼을 열어두면 제출이 반드시 409 로 끝난다 — 폼 대신 안내를 둔다.
            <p className="rounded-md bg-graysoft/60 px-3 py-3 text-sm text-charcoal-2">
              {CLOSED_NOTICE}
            </p>
          )
        ) : (
          <ActiveCodeCard
            // 재생성으로 링크가 바뀌면 카드를 새로 마운트한다 — 안 그러면 재생성 폼 상태가 남아
            // 새 링크가 이미 발급됐는데도 폼이 계속 보인다.
            key={activeCodeQuery.data.joinCodeId}
            clubId={clubId}
            recruitmentId={recruitmentId}
            clubName={clubName}
            joinCode={activeCodeQuery.data}
            useGeneration={useGeneration}
            canCreate={canCreate}
          />
        ))}

      <div className="mt-4">
        <MemberEnrollmentStepsCard />
      </div>

      <ul className="mt-4 space-y-1.5 rounded-md border border-line bg-graysoft/40 px-4 py-3 text-xs leading-relaxed text-charcoal-2">
        {JOIN_LINK_POLICIES.map((policy) => (
          <li key={policy} className="flex gap-1.5">
            <span aria-hidden="true" className="text-charcoal-3">
              ·
            </span>
            <span>{policy}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs leading-relaxed text-charcoal-3">{DEDUCTION_NOTICE}</p>

      <Link
        href={toRoute(`/manage/clubs/${clubId}/members/requests`)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-charcoal-2 hover:border-ink hover:text-ink"
      >
        가입 요청 관리
        {clubPendingCount > 0 && (
          <span className="rounded-full bg-coral px-1.5 py-0.5 text-xs font-semibold text-paper">
            {clubPendingCount}
          </span>
        )}
      </Link>
    </div>
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
  const [joinWindowDays, setJoinWindowDays] = useState<number>(DEFAULT_JOIN_WINDOW_DAYS);
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
        joinWindowDays,
        // 기수 미입력은 필드 자체를 보내지 않는다 — BE 가 null 을 "기수 없음" 으로 저장한다.
        ...(trimmedGeneration === '' ? {} : { generation: Number(trimmedGeneration) }),
      });
    } catch (createFailure) {
      // 409 는 여러 종류(자체 폼 모집·종료된 모집·동시 재생성)라 문구를 프론트에서 짜지 않고
      // 서버 메시지를 그대로 쓴다.
      setError(extractErrorMessage(createFailure) ?? '가입 링크를 만들지 못했어요.');
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
          이 인원만큼 신청이 들어오면 링크는 더 이상 쓸 수 없어요. 거절하면 자리가 다시 열려요.
        </p>
      </div>

      <fieldset disabled={createJoinCode.isPending}>
        <legend className="mb-1.5 text-xs font-semibold text-charcoal-2">가입 가능 기간</legend>
        <div className="space-y-1.5">
          {JOIN_WINDOW_OPTIONS.map((option) => (
            <label key={option.days} className="flex items-center gap-2 text-sm text-charcoal">
              <input
                type="radio"
                name="join-window-days"
                value={option.days}
                checked={joinWindowDays === option.days}
                onChange={() => setJoinWindowDays(option.days)}
                className="h-4 w-4 accent-ink"
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-charcoal-3">
          모집이 실제로 종료된 시각을 기준으로 계산해요. 진행 중에는 링크가 계속 열려 있어요.
        </p>
      </fieldset>

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
          <p className="mt-1 text-xs text-charcoal-3">이 링크로 가입한 회원에게 자동으로 찍힙니다.</p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">
          {error}
        </p>
      )}

      {/* 성공 후에도 활성 링크 재조회가 도착할 때까지는 폼이 그대로라, 재활성화하면 두 번째 클릭이
          방금 만든 링크를 폐기하고 새로 만든다(BE 원자 재생성). 성공하면 다시 열지 않는다. */}
      <button
        type="button"
        onClick={submit}
        disabled={createJoinCode.isPending || createJoinCode.isSuccess}
        className="btn btn-primary btn-sm w-full"
      >
        {(createJoinCode.isPending || createJoinCode.isSuccess) && <ButtonSpinner />}가입 링크 만들기
      </button>
    </div>
  );
}

function ActiveCodeCard({
  clubId,
  recruitmentId,
  clubName,
  joinCode,
  useGeneration,
  canCreate,
}: {
  clubId: number;
  recruitmentId: number;
  clubName: string;
  joinCode: JoinCodeSummary;
  useGeneration: boolean;
  canCreate: boolean;
}) {
  const revokeJoinCode = useRevokeJoinCodeMutation(clubId, recruitmentId);
  const [confirming, setConfirming] = useState<'revoke' | 'regenerate' | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // 모집 종료 후 폐기는 재생성이 불가능하므로 문구 타이핑 2단계를 요구한다(스펙 §4.3.1).
  const [revokeConfirmInput, setRevokeConfirmInput] = useState('');
  // 재생성은 "확인 → 생성 폼" 2단계다. 새 링크 생성이 곧 기존 링크 폐기(BE 원자 재생성)이므로
  // 여기서 따로 폐기 API 를 부르지 않는다 — 부르면 실패 시 링크 없는 상태로 남는다.
  const [regenerating, setRegenerating] = useState(false);

  const expired = isExpired(joinCode);
  const joinLink = `${window.location.origin}/join/${joinCode.code}`;
  const requiresTypedConfirm = !canCreate;

  function closeRevokeDialog() {
    setConfirming(null);
    setDialogError(null);
    setRevokeConfirmInput('');
  }

  async function revoke() {
    setDialogError(null);
    try {
      await revokeJoinCode.mutateAsync(joinCode.joinCodeId);
      closeRevokeDialog();
    } catch (revokeFailure) {
      // 실패하면 모달을 닫지 않는다 — 같은 자리에서 재시도할 수 있게 맥락을 유지한다.
      setDialogError(extractErrorMessage(revokeFailure) ?? '가입 링크를 폐기하지 못했어요.');
    }
  }

  if (regenerating) {
    return (
      <CreateCodeForm clubId={clubId} recruitmentId={recruitmentId} useGeneration={useGeneration} />
    );
  }

  return (
    <div className="space-y-4">
      {/* 상태 카드 (스펙 §7.2) — 신청·대기 수치는 BE 응답을 그대로 쓴다(프론트 합산 금지). */}
      <dl
        aria-label="가입 링크 상태"
        className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-md border border-line bg-paper p-4 text-sm"
      >
        <div>
          <dt className="text-xs text-charcoal-3">링크 상태</dt>
          <dd className="mt-0.5 font-semibold text-ink-deep">{expired ? '만료' : '🟢 활성'}</dd>
        </div>
        <div>
          <dt className="text-xs text-charcoal-3">가입 가능 기간</dt>
          <dd className="mt-0.5 text-ink-deep">{joinWindowLabel(joinCode)}</dd>
        </div>
        <div>
          <dt className="text-xs text-charcoal-3">누적 가입 신청</dt>
          <dd className="mt-0.5 tabular-nums text-ink-deep">{joinCode.totalRequestCount}건</dd>
        </div>
        <div>
          <dt className="text-xs text-charcoal-3">승인 대기</dt>
          <dd className="mt-0.5 tabular-nums text-ink-deep">{joinCode.pendingCount}건</dd>
        </div>
      </dl>

      <div className="rounded-md border border-line bg-graysoft/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-xl font-bold tracking-widest text-ink-deep">{joinCode.code}</p>
          <div className="flex shrink-0 gap-1">
            <CopyButton label="코드 복사" value={joinCode.code} />
            <CopyButton label="가입 링크 복사" value={joinLink} />
          </div>
        </div>

        {/* 유출 경고는 복사 버튼 바로 아래에 둔다 (스펙 §9) — 공유 직전에 읽히는 자리다. */}
        <p className="mt-3 rounded-md bg-coral/5 px-3 py-2 text-xs leading-relaxed text-coral">
          {LEAK_WARNING}
        </p>

        {joinCode.generation !== null && (
          <div className="mt-3">
            <span className="pill !px-2 !py-0.5">{joinCode.generation}기</span>
          </div>
        )}

        <dl className="mt-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-charcoal-3">사용</dt>
            <dd className="text-ink-deep">
              {joinCode.usedCount} / {joinCode.maxUses}명
            </dd>
          </div>
        </dl>

        {/* 합격 안내 템플릿 (스펙 §5.1) — 보낼 문구를 그대로 보여주고 한 번에 복사하게 한다. */}
        <div className="mt-4 rounded-md border border-line bg-paper p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-charcoal-2">합격 안내 문구</p>
            <CopyButton label="안내 문구 복사" value={acceptanceMessage(clubName, joinLink)} />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-charcoal-2">
            {acceptanceMessage(clubName, joinLink)}
          </p>
        </div>
      </div>

      {!canCreate && (
        <p className="rounded-md bg-graysoft/60 px-3 py-3 text-sm text-charcoal-2">{CLOSED_NOTICE}</p>
      )}

      <div className="flex gap-2">
        {/* 종료된 모집에서는 재생성이 409 라 버튼 자체를 두지 않는다(스펙 §4.2). */}
        {canCreate && (
          <button
            type="button"
            onClick={() => setConfirming('regenerate')}
            className="btn btn-ghost btn-sm flex-1"
          >
            링크 재생성
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirming('revoke')}
          className="btn btn-sm flex-1 text-coral hover:bg-coral/5"
        >
          링크 폐기
        </button>
      </div>

      <ConfirmDialog
        open={confirming === 'revoke'}
        title="가입 링크를 폐기할까요?"
        description={
          requiresTypedConfirm
            ? REVOKE_AFTER_CLOSE_WARNING
            : '폐기하면 이 링크로는 더 이상 가입 요청을 보낼 수 없습니다. 이미 접수된 요청은 그대로 남습니다.'
        }
        confirmLabel="폐기"
        isPending={revokeJoinCode.isPending}
        errorMessage={dialogError}
        confirmDisabled={requiresTypedConfirm && revokeConfirmInput.trim() !== REVOKE_CONFIRM_WORD}
        onConfirm={revoke}
        onCancel={closeRevokeDialog}
      >
        {requiresTypedConfirm && (
          <div>
            <label
              htmlFor="join-code-revoke-confirm"
              className="mb-1.5 block text-xs font-semibold text-charcoal-2"
            >
              계속하려면 &lsquo;{REVOKE_CONFIRM_WORD}&rsquo; 를 입력하세요
            </label>
            <input
              id="join-code-revoke-confirm"
              type="text"
              autoComplete="off"
              value={revokeConfirmInput}
              onChange={(event) => setRevokeConfirmInput(event.target.value)}
              disabled={revokeJoinCode.isPending}
              className={fieldCls}
            />
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirming === 'regenerate'}
        title="가입 링크를 새로 만들까요?"
        description="기존 링크는 즉시 사용할 수 없게 됩니다. 이미 전달한 링크는 모두 무효가 됩니다."
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
