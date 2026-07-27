'use client';

import { ApiError } from '@duing/api';
import {
  formatDateTimeKst,
  useLogoutAllMutation,
  useMySessionsQuery,
  useRevokeSessionMutation,
} from '@duing/hooks';
import type { MySession, SessionPlatform } from '@duing/types';

import { useToast } from '@/app/_components/toast/ToastProvider';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';

/**
 * 세션 폐기 실패를 사용자 문구로 옮긴다.
 *
 * 세션 폐기는 실패 사유마다 사용자가 할 일이 다르다 — 이미 만료된 세션이면 목록을 새로고침하면 되고,
 * 권한 문제면 재시도해도 계속 실패한다. 그래서 서버가 준 사유를 그대로 보여주고, 서버 응답 자체가
 * 아닌 실패(네트워크 끊김 등)에만 기본 안내로 떨어진다. 레포 다수 화면이 쓰는 형태와 같다.
 */
function sessionErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : `${fallback} 잠시 후 다시 시도해 주세요.`;
}

const PLATFORM_LABEL: Record<SessionPlatform, string> = {
  WEB: '웹',
  IOS: 'iOS',
  ANDROID: 'Android',
  UNKNOWN: '기타',
};

function SessionRow({
  session,
  onRevoke,
  revoking,
}: {
  session: MySession;
  onRevoke: (sessionId: number) => void;
  revoking: boolean;
}) {
  const platformLabel = PLATFORM_LABEL[session.platform];
  const lastUsed = formatDateTimeKst(session.lastUsedAt);

  return (
    <div className="flex items-center gap-4 py-4 border-b border-line">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14.5px] font-semibold text-ink-deep truncate">
            {session.deviceLabel ?? platformLabel}
          </span>
          {session.current && (
            <span className="pill text-[11px] px-2.5 py-0.5">현재 기기</span>
          )}
        </div>
        <div className="text-[12.5px] text-charcoal-3 mt-0.5">
          {session.deviceLabel ? `${platformLabel} · ` : ''}마지막 사용 {lastUsed}
        </div>
      </div>
      {!session.current && (
        <button
          type="button"
          onClick={() => onRevoke(session.sessionId)}
          disabled={revoking}
          className="btn btn-ghost btn-sm shrink-0"
        >
          로그아웃
        </button>
      )}
    </div>
  );
}

export function SessionListCard() {
  const sessionsQuery = useMySessionsQuery();
  const revokeMutation = useRevokeSessionMutation();
  const logoutAllMutation = useLogoutAllMutation();
  const { addToast } = useToast();
  const router = useGuardedRouter();

  const sessions = sessionsQuery.data;

  const handleRevoke = (sessionId: number) => {
    revokeMutation.mutate(sessionId, {
      onSuccess: () => addToast('해당 기기에서 로그아웃했어요.'),
      onError: (revokeError) =>
        addToast(sessionErrorMessage(revokeError, '기기를 로그아웃하지 못했어요.'), {
          variant: 'error',
        }),
    });
  };

  const handleLogoutAll = () => {
    logoutAllMutation.mutate(undefined, {
      onSuccess: () => router.replace('/'),
      onError: (logoutError) =>
        addToast(sessionErrorMessage(logoutError, '로그아웃하지 못했어요.'), { variant: 'error' }),
    });
  };

  return (
    <section className="bg-paper rounded-lg border border-line mb-4 overflow-hidden">
      <div className="px-7 py-5 border-b border-line">
        <h3 className="text-[17px] font-body font-bold text-ink-deep">로그인된 기기</h3>
        <p className="text-[12.5px] text-charcoal-3 mt-1">
          이 계정으로 로그인된 세션 목록이에요. 낯선 기기가 있다면 로그아웃하세요.
        </p>
      </div>
      <div className="px-7 py-2">
        {sessionsQuery.isPending ? (
          <div className="py-2">
            <ListRowsSkeleton rows={2} rowClassName="h-[52px]" label="기기 목록 불러오는 중" />
          </div>
        ) : sessionsQuery.isError ? (
          <p className="py-6 text-center text-[13px] text-charcoal-3">
            기기 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
          </p>
        ) : !sessions || sessions.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-charcoal-3">표시할 기기가 없어요.</p>
        ) : (
          <>
            {sessions.map((session) => (
              <SessionRow
                key={session.sessionId}
                session={session}
                onRevoke={handleRevoke}
                revoking={revokeMutation.isPending && revokeMutation.variables === session.sessionId}
              />
            ))}
            <div className="py-4">
              <button
                type="button"
                onClick={handleLogoutAll}
                disabled={logoutAllMutation.isPending}
                className="btn btn-ghost btn-sm text-coral"
              >
                다른 모든 기기에서 로그아웃
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
