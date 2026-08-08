'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import {
  formatDateTimeKst,
  parseKstInstant,
  useClubInviteCodeQuery,
  useCreateClubInviteCodeMutation,
  useRevokeClubInviteCodeMutation,
} from '@duing/hooks';
import type { CreateClubInviteCodePayload, JoinCodeSummary } from '@duing/types';

import { ButtonSpinner } from '@/components/loading/Spinner';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * 회원 관리 헤더의 [부원 초대] (스펙 2026-08-08 §7). 모집 가입 링크(`MemberEnrollmentSection`)와
 * 폼·카드·복사 구조는 같지만 모집에 귀속되지 않아 별도 컴포넌트로 둔다 — 초대 링크는 동아리당 1개,
 * 만료는 모집 종료 기준 파생이 아니라 발급 시각 기준 절대 시각(24/72시간)이고, 자동 승인 옵션이 있다.
 *
 * 활성 링크 조회는 다이얼로그가 열릴 때만 나간다(Radix 가 닫힌 동안 내용을 마운트하지 않는다) —
 * 회원 관리 진입만으로 초대 링크를 조회하지 않기 위해서다.
 */
type ClubInviteDialogProps = {
  clubId: number;
  /** 기수를 쓰지 않는 동아리에는 기수 입력을 감춘다 — 링크에 붙는 기수 스냅샷도 의미가 없다. */
  useGeneration: boolean;
};

// 유효기간 프리셋 2택 (스펙 §3) — 직접 입력은 없고, 프리셋 밖 값은 BE 400 이다.
const EXPIRES_IN_HOURS_OPTIONS = [
  { hours: 24, label: '24시간' },
  { hours: 72, label: '72시간' },
] as const;
const DEFAULT_EXPIRES_IN_HOURS: CreateClubInviteCodePayload['expiresInHours'] = 24;

const MAX_USES_LIMIT = 150;
const MAX_USES_ERROR = `최대 인원은 1~${MAX_USES_LIMIT} 사이로 입력해주세요.`;

// 자동 승인은 운영진 승인 게이트를 통째로 건너뛴다 — 켠 순간 유출 위험이 성격이 달라지므로 경고를 붙인다.
const AUTO_APPROVE_WARNING = '승인 없이 바로 가입됩니다. 링크 유출에 주의하세요.';

const EXPIRED_NOTICE = '만료된 초대 링크예요. 새로 만들어 다시 공유해주세요.';
const EXHAUSTED_NOTICE = '초대 인원이 모두 찼어요. 새로 만들어 다시 공유해주세요.';

const fieldCls =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** 초대 링크의 만료 시각. BE 가 `joinExpiresAt` 에도 같은 값을 싣지만 의미가 분명한 쪽을 먼저 본다. */
function expiresAtIso(joinCode: JoinCodeSummary): string | null {
  return joinCode.inviteExpiresAt ?? joinCode.joinExpiresAt;
}

function isExpired(joinCode: JoinCodeSummary): boolean {
  const iso = expiresAtIso(joinCode);
  return iso !== null && parseKstInstant(iso).getTime() <= Date.now();
}

function isExhausted(joinCode: JoinCodeSummary): boolean {
  return joinCode.usedCount >= joinCode.maxUses;
}

export function ClubInviteDialog({ clubId, useGeneration }: ClubInviteDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-charcoal-2 hover:border-ink hover:text-ink"
      >
        부원 초대
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>부원 초대</DialogTitle>
            <DialogDescription>
              이미 활동 중인 부원에게 초대 링크를 보내 한 번에 가입시킬 수 있어요. 모집 절차와는
              무관해요.
            </DialogDescription>
          </DialogHeader>

          <ClubInvitePanel clubId={clubId} useGeneration={useGeneration} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ClubInvitePanel({ clubId, useGeneration }: ClubInviteDialogProps) {
  const inviteCodeQuery = useClubInviteCodeQuery(clubId);

  return (
    <div>
      {inviteCodeQuery.isLoading && (
        <LoadingGate label="초대 링크 불러오는 중" className="min-h-0 py-10" />
      )}
      {inviteCodeQuery.isError && (
        <p role="alert" className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">
          {extractErrorMessage(inviteCodeQuery.error) ?? '초대 링크를 불러오지 못했어요.'}
        </p>
      )}
      {/* 활성 링크가 없으면 200 + null 이다 — 에러가 아니라 "아직 안 만듦" 이다. */}
      {inviteCodeQuery.isSuccess &&
        (inviteCodeQuery.data === null ? (
          <CreateInviteForm clubId={clubId} useGeneration={useGeneration} />
        ) : (
          <ActiveInviteCard
            // 재생성으로 링크가 바뀌면 카드를 새로 마운트한다 — 안 그러면 재생성 폼 상태가 남아
            // 새 링크가 이미 발급됐는데도 폼이 계속 보인다.
            key={inviteCodeQuery.data.joinCodeId}
            clubId={clubId}
            joinCode={inviteCodeQuery.data}
            useGeneration={useGeneration}
          />
        ))}
    </div>
  );
}

function CreateInviteForm({ clubId, useGeneration }: ClubInviteDialogProps) {
  const createInvite = useCreateClubInviteCodeMutation(clubId);
  const [maxUses, setMaxUses] = useState('');
  const [expiresInHours, setExpiresInHours] =
    useState<CreateClubInviteCodePayload['expiresInHours']>(DEFAULT_EXPIRES_IN_HOURS);
  const [generation, setGeneration] = useState('');
  const [autoApprove, setAutoApprove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmedMaxUses = maxUses.trim();
    const parsedMaxUses = Number(trimmedMaxUses);
    if (!/^\d+$/.test(trimmedMaxUses) || parsedMaxUses < 1 || parsedMaxUses > MAX_USES_LIMIT) {
      setError(MAX_USES_ERROR);
      return;
    }
    const trimmedGeneration = generation.trim();
    if (
      trimmedGeneration !== '' &&
      (!/^\d+$/.test(trimmedGeneration) || Number(trimmedGeneration) < 1)
    ) {
      setError('기수는 1 이상의 정수여야 해요.');
      return;
    }
    setError(null);
    try {
      await createInvite.mutateAsync({
        maxUses: parsedMaxUses,
        expiresInHours,
        autoApprove,
        // 기수 미입력은 필드 자체를 보내지 않는다 — BE 가 null 을 "기수 없음" 으로 저장한다.
        ...(trimmedGeneration === '' ? {} : { generation: Number(trimmedGeneration) }),
      });
    } catch (createFailure) {
      // 409(동시 생성 경쟁)·403·400 등 사유가 여러 갈래라 문구를 프론트에서 짜지 않고 서버 메시지를 쓴다.
      setError(extractErrorMessage(createFailure) ?? '초대 링크를 만들지 못했어요.');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="club-invite-max-uses"
          className="mb-1.5 block text-xs font-semibold text-charcoal-2"
        >
          최대 인원
        </label>
        <input
          id="club-invite-max-uses"
          type="number"
          min={1}
          max={MAX_USES_LIMIT}
          inputMode="numeric"
          value={maxUses}
          onChange={(event) => setMaxUses(event.target.value)}
          placeholder="예: 40"
          disabled={createInvite.isPending}
          className={fieldCls}
        />
        <p className="mt-1 text-xs text-charcoal-3">
          이 인원만큼 신청이 들어오면 링크는 더 이상 쓸 수 없어요. 거절하면 자리가 다시 열려요.
        </p>
      </div>

      <fieldset disabled={createInvite.isPending}>
        <legend className="mb-1.5 text-xs font-semibold text-charcoal-2">유효기간</legend>
        <div className="space-y-1.5">
          {EXPIRES_IN_HOURS_OPTIONS.map((option) => (
            <label key={option.hours} className="flex items-center gap-2 text-sm text-charcoal">
              <input
                type="radio"
                name="club-invite-expires-in-hours"
                value={option.hours}
                checked={expiresInHours === option.hours}
                onChange={() => setExpiresInHours(option.hours)}
                className="h-4 w-4 accent-ink"
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-charcoal-3">
          만든 시각부터 계산해요. 기간이 지나면 링크는 자동으로 만료돼요.
        </p>
      </fieldset>

      {useGeneration && (
        <div>
          <label
            htmlFor="club-invite-generation"
            className="mb-1.5 block text-xs font-semibold text-charcoal-2"
          >
            기수 (선택)
          </label>
          <input
            id="club-invite-generation"
            type="number"
            min={1}
            inputMode="numeric"
            value={generation}
            onChange={(event) => setGeneration(event.target.value)}
            placeholder="예: 12"
            disabled={createInvite.isPending}
            className={fieldCls}
          />
          <p className="mt-1 text-xs text-charcoal-3">이 링크로 가입한 회원에게 자동으로 찍힙니다.</p>
        </div>
      )}

      <div>
        {/* 접근가능 이름이 '자동 승인' 하나로 읽히도록 설명 문장은 라벨 밖에 둔다. */}
        <label className="flex items-center gap-2 text-sm font-semibold text-charcoal-2">
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={(event) => setAutoApprove(event.target.checked)}
            disabled={createInvite.isPending}
            className="h-4 w-4 accent-ink"
          />
          자동 승인
        </label>
        <p className="mt-1 text-xs text-charcoal-3">
          켜면 운영진 승인 없이 가입이 끝나요. 만든 뒤에는 바꿀 수 없고, 바꾸려면 링크를 다시
          만들어야 해요.
        </p>
        {autoApprove && (
          <p className="mt-2 rounded-md bg-coral/5 px-3 py-2 text-xs leading-relaxed text-coral">
            {AUTO_APPROVE_WARNING}
          </p>
        )}
      </div>

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
        disabled={createInvite.isPending || createInvite.isSuccess}
        className="btn btn-primary btn-sm w-full"
      >
        {(createInvite.isPending || createInvite.isSuccess) && <ButtonSpinner />}초대 링크 만들기
      </button>
    </div>
  );
}

function ActiveInviteCard({
  clubId,
  joinCode,
  useGeneration,
}: {
  clubId: number;
  joinCode: JoinCodeSummary;
  useGeneration: boolean;
}) {
  const revokeInvite = useRevokeClubInviteCodeMutation(clubId);
  const [confirming, setConfirming] = useState<'revoke' | 'regenerate' | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // 재생성은 "확인 → 발급 폼" 2단계다. 새 링크 생성이 곧 기존 링크 폐기(BE 원자 재생성)이므로
  // 여기서 따로 폐기 API 를 부르지 않는다 — 부르면 실패 시 링크 없는 상태로 남는다.
  const [regenerating, setRegenerating] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const expired = isExpired(joinCode);
  const exhausted = isExhausted(joinCode);
  const expiresIso = expiresAtIso(joinCode);
  const joinLink = `${window.location.origin}/join/${joinCode.code}`;

  function closeRevokeDialog() {
    setConfirming(null);
    setDialogError(null);
  }

  async function revoke() {
    setDialogError(null);
    try {
      await revokeInvite.mutateAsync(joinCode.joinCodeId);
      closeRevokeDialog();
    } catch (revokeFailure) {
      // 실패하면 모달을 닫지 않는다 — 같은 자리에서 재시도할 수 있게 맥락을 유지한다.
      setDialogError(extractErrorMessage(revokeFailure) ?? '초대 링크를 폐기하지 못했어요.');
    }
  }

  if (regenerating) {
    return <CreateInviteForm clubId={clubId} useGeneration={useGeneration} />;
  }

  return (
    <div className="space-y-4">
      {/* 상태 카드 — 신청·대기 수치는 BE 응답을 그대로 쓴다(프론트 합산 금지). */}
      <dl
        aria-label="초대 링크 상태"
        className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-md border border-line bg-paper p-4 text-sm"
      >
        <div>
          <dt className="text-xs text-charcoal-3">링크 상태</dt>
          <dd className="mt-0.5 font-semibold text-ink-deep">
            {expired ? '만료됨' : exhausted ? '인원 마감' : '🟢 활성'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-charcoal-3">만료 일시</dt>
          <dd className="mt-0.5 text-ink-deep">
            {expiresIso === null ? '-' : `${formatDateTimeKst(expiresIso)}까지`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-charcoal-3">누적 신청</dt>
          <dd className="mt-0.5 tabular-nums text-ink-deep">
            {joinCode.totalRequestCount} / {joinCode.maxUses}명
          </dd>
        </div>
        <div>
          <dt className="text-xs text-charcoal-3">승인 대기</dt>
          <dd className="mt-0.5 tabular-nums text-ink-deep">{joinCode.pendingCount}명</dd>
        </div>
      </dl>

      {(expired || exhausted) && (
        <p className="rounded-md bg-graysoft/60 px-3 py-3 text-sm text-charcoal-2">
          {expired ? EXPIRED_NOTICE : EXHAUSTED_NOTICE}
        </p>
      )}

      <div className="rounded-md border border-line bg-graysoft/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-xl font-bold tracking-widest text-ink-deep">{joinCode.code}</p>
          <div className="flex shrink-0 gap-1">
            <CopyButton label="링크 복사" value={joinLink} />
            <button
              type="button"
              onClick={() => setQrOpen((prev) => !prev)}
              aria-expanded={qrOpen}
              className="rounded-md px-2 py-1 text-xs font-medium text-charcoal-2 transition-colors hover:bg-sage-tint hover:text-ink"
            >
              {qrOpen ? 'QR 숨기기' : 'QR 보기'}
            </button>
          </div>
        </div>

        {joinCode.autoApprove && (
          <p className="mt-3 rounded-md bg-coral/5 px-3 py-2 text-xs leading-relaxed text-coral">
            자동 승인 링크예요. {AUTO_APPROVE_WARNING}
          </p>
        )}

        {joinCode.generation !== null && (
          <div className="mt-3">
            <span className="pill !px-2 !py-0.5">{joinCode.generation}기</span>
          </div>
        )}

        {/* 오프라인 대면 가입용 — 화면을 그대로 찍게 한다. 링크 전체를 title 로 붙여 대체 텍스트도 남긴다. */}
        {qrOpen && (
          <div className="mt-3 flex justify-center rounded-md bg-paper p-4">
            <QRCode value={joinLink} title={joinLink} size={160} />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming('regenerate')}
          className="btn btn-ghost btn-sm flex-1"
        >
          링크 재생성
        </button>
        <button
          type="button"
          onClick={() => setConfirming('revoke')}
          className="btn btn-sm flex-1 text-coral hover:bg-coral/5"
        >
          링크 폐기
        </button>
      </div>

      {/* 초대 링크는 언제든 다시 만들 수 있어 폐기가 되돌릴 수 없는 작업이 아니다 —
          모집 종료 후 폐기(재생성 불가)와 달리 타이핑 2단계를 두지 않는다(스펙 §3). */}
      <ConfirmDialog
        open={confirming === 'revoke'}
        title="초대 링크를 폐기할까요?"
        description="폐기하면 이 링크로는 더 이상 가입할 수 없습니다. 이미 접수된 요청은 그대로 남습니다."
        confirmLabel="폐기"
        isPending={revokeInvite.isPending}
        errorMessage={dialogError}
        onConfirm={revoke}
        onCancel={closeRevokeDialog}
      />

      <ConfirmDialog
        open={confirming === 'regenerate'}
        title="초대 링크를 새로 만들까요?"
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

/** 복사 성공은 라벨을 잠깐 "복사됨" 으로 바꿔 알린다(가입 링크 패널·연락처 복사와 동일 규약). */
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
