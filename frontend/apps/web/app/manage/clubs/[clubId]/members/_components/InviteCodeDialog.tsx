'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  formatDateKst,
  parseKstInstant,
  useActiveJoinCodeQuery,
  useCreateJoinCodeMutation,
  useRevokeJoinCodeMutation,
} from '@duing/hooks';
import type { JoinCodeSummary } from '@duing/types';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';

type InviteCodeDialogProps = {
  clubId: number;
  // 기수를 쓰지 않는 동아리에는 기수 입력을 감춘다 — 코드에 붙는 기수 스냅샷도 의미가 없다.
  useGeneration: boolean;
  onClose: () => void;
};

const EXPIRY_OPTIONS = [7, 30, 90] as const;
const DEFAULT_EXPIRY_DAYS = 30;

const fieldCls =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function InviteCodeDialog({ clubId, useGeneration, onClose }: InviteCodeDialogProps) {
  const activeCodeQuery = useActiveJoinCodeQuery(clubId);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>회원 초대</DialogTitle>
          <DialogDescription>
            외부 폼으로 뽑은 합격자에게 가입 코드를 전달하면, 학생이 직접 가입 요청을 보낼 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        {activeCodeQuery.isLoading && <LoadingGate label="가입 코드 불러오는 중" className="min-h-0 py-10" />}
        {activeCodeQuery.isError && (
          <p role="alert" className="rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">
            {extractErrorMessage(activeCodeQuery.error) ?? '가입 코드를 불러오지 못했어요.'}
          </p>
        )}
        {activeCodeQuery.isSuccess &&
          (activeCodeQuery.data === null ? (
            <CreateCodeForm clubId={clubId} useGeneration={useGeneration} />
          ) : (
            <ActiveCodeCard
              // 재생성으로 코드가 바뀌면 카드를 새로 마운트한다 — 안 그러면 재생성 폼 상태가 남아
              // 새 코드가 이미 발급됐는데도 폼이 계속 보인다.
              key={activeCodeQuery.data.joinCodeId}
              clubId={clubId}
              joinCode={activeCodeQuery.data}
              useGeneration={useGeneration}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}

function CreateCodeForm({ clubId, useGeneration }: { clubId: number; useGeneration: boolean }) {
  const createJoinCode = useCreateJoinCodeMutation(clubId);
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
      // 409 는 두 종류(외부 폼 모집 없음 / 동시 재생성)라 문구를 프론트에서 짜지 않고 서버 메시지를 그대로 쓴다.
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
        <p className="mt-1 text-xs text-charcoal-3">이 인원만큼 승인되면 코드는 더 이상 쓸 수 없습니다.</p>
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

      <button
        type="button"
        onClick={submit}
        disabled={createJoinCode.isPending}
        className="btn btn-primary btn-sm w-full"
      >
        {createJoinCode.isPending && <ButtonSpinner />}코드 만들기
      </button>
    </div>
  );
}

function ActiveCodeCard({
  clubId,
  joinCode,
  useGeneration,
}: {
  clubId: number;
  joinCode: JoinCodeSummary;
  useGeneration: boolean;
}) {
  const revokeJoinCode = useRevokeJoinCodeMutation(clubId);
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
    return <CreateCodeForm clubId={clubId} useGeneration={useGeneration} />;
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

        <div className="mt-3 flex flex-wrap gap-1.5">
          {isExpired && <Badge tone="warn">만료됨</Badge>}
          {!joinCode.recruitmentOpen && <Badge tone="warn">모집 마감으로 사용 불가</Badge>}
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

function Badge({ tone, children }: { tone: 'warn' | 'muted'; children: ReactNode }) {
  return (
    <span
      className={
        tone === 'warn'
          ? 'rounded-full bg-[#fce2d9] px-2 py-0.5 text-xs font-medium text-[#9a3f23]'
          : 'rounded-full bg-sage-mist px-2 py-0.5 text-xs font-medium text-ink'
      }
    >
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
