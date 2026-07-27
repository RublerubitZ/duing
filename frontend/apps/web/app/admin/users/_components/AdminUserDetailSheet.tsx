'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  useAdminUserDetailQuery,
  useAdminUserNoteMutation,
  useAdminUserPhoneMutation,
} from '@duing/hooks';
// 시각 표시는 레포 공용 KST 포매터를 쓴다 — 백엔드가 절대시각(…Z)으로 내려주므로 존 보정은 하지 않고
// 표시만 Asia/Seoul 로 고정한다. toLocaleString 은 실행 환경 타임존을 타서 화면·테스트가 흔들린다.
import { formatDateKst, formatDateTimeKst } from '@duing/hooks/datetime';
import { useAuthStore } from '@duing/stores';
import type { AdminUserDetail } from '@duing/types';

import { useToast } from '@/app/_components/toast/ToastProvider';
import { ArrowRight, Info } from '@/components/duing/Icon';
import { clubMemberRoleLabel } from '@/app/_lib/clubMemberRoleLabel';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { ButtonSpinner } from '@/components/loading/Spinner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import { ErrorState } from '../../_components/ErrorState';
import { ADMIN_USER_ACTION_LABEL } from '../_lib/userActionLabels';
import { UserStatusBadge } from './UserStatusBadge';

// 서버 검증은 Bean Validation 의 @Size 라 UTF-16 코드유닛으로 센다. 클라이언트도 같은 단위여야 한다 —
// `[...str].length` 나 Intl.Segmenter 로 세면(코드포인트/서체소) 이모지가 섞인 메모에서 FE 는 통과시키고
// 서버가 400 을 낸다. textarea 의 maxLength 와 `str.length` 가 정확히 그 단위다.
const NOTE_MAX_LENGTH = 1000;
// 글자 수를 상시 노출하면 한 줄짜리 메모에도 시선이 가는 잡음이 된다 — 상한이 실제로 걸리는
// 구간에서만 띄워서, 저장이 막혔을 때 이유를 화면에서 바로 읽을 수 있게 한다.
const NOTE_LENGTH_HINT_FROM = NOTE_MAX_LENGTH - 50;

// 접힌 상태에서 보여줄 운영 기록 건수. 서버가 최근 20건을 함께 내려주므로 펼치는 데 추가 조회가 없다.
const COLLAPSED_ACTION_COUNT = 3;

// 위험 작업 버튼은 공용 파괴적 액션 변형(.btn-danger)을 쓴다 — 색을 화면에서 직접 칠하지 않는다.
const DANGER_BUTTON_CLASS = 'btn btn-sm btn-danger shrink-0';

/**
 * 정지를 막아야 하는 대상이면 그 사유를, 아니면 null 을 돌려준다.
 * 서버도 같은 두 조건을 400 으로 막는다 — 화면은 사유를 다 입력한 뒤에야 거절당하는 헛수고를 없앨 뿐이고
 * 실제 방어선은 서버다. 강제 로그아웃에는 이 제약이 없다(계정이 잠기지 않고 재로그인하면 복구된다).
 */
function suspendBlockedReason(detail: AdminUserDetail, currentUserId: number | null): string | null {
  if (currentUserId !== null && detail.id === currentUserId) {
    return '자기 자신의 계정은 정지할 수 없습니다.';
  }
  if (detail.role === 'ADMIN') {
    return '관리자 계정은 정지할 수 없습니다.';
  }
  return null;
}

type ContentProps = {
  detail: AdminUserDetail;
  /** 자기 자신 정지를 미리 거르기 위한 현재 관리자 id. 세션이 아직 안 실렸으면 null(서버가 막는다). */
  currentUserId: number | null;
  revealedPhone: string | null;
  isRevealingPhone: boolean;
  isSavingNote: boolean;
  onRevealPhone: () => void;
  onSaveNote: (note: string) => void;
  onSuspend: () => void;
  onUnsuspend: () => void;
  onForceLogout: () => void;
};

export function AdminUserDetailSheetContent({
  detail,
  currentUserId,
  revealedPhone,
  isRevealingPhone,
  isSavingNote,
  onRevealPhone,
  onSaveNote,
  onSuspend,
  onUnsuspend,
  onForceLogout,
}: ContentProps) {
  const [note, setNote] = useState(detail.adminNote ?? '');
  const [showAllActions, setShowAllActions] = useState(false);

  // 다른 회원으로 패널이 바뀌면 메모 입력값을 그 회원 것으로 다시 시드한다.
  // detail.adminNote 는 의존성에서 뺀다 — 넣으면 저장 후 재조회(상태 변경 뮤테이션이 목록 접두사를
  // 무효화해 상세까지 덮는 경로 포함)가 착지하는 순간 그 사이 타이핑한 내용을 경고 없이 되돌린다.
  // 대신 서버가 값을 정규화해도 입력창은 사용자가 친 그대로 남는다 — 표시가 한 박자 어긋나는 쪽이
  // 입력이 조용히 사라지는 것보다 낫다고 판단했다.
  useEffect(() => {
    setNote(detail.adminNote ?? '');
    // 다른 회원으로 바뀌면 펼침도 접는다 — 앞 회원에서 펼친 상태가 따라오면 이 회원의 기록이
    // 몇 건인지 오해하게 된다.
    setShowAllActions(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.id]);

  const noteUpdatedAt = detail.adminNoteUpdatedAt ? formatDateTimeKst(detail.adminNoteUpdatedAt) : null;
  // maxLength 는 타이핑·붙여넣기만 끊는다. 드래그-드롭 삽입이나 자동입력 확장으로 들어온 값은
  // 그대로 통과하므로, 서버가 검증하는 값(보내는 값 = note)으로 한 번 더 막는다.
  const isNoteOverLimit = note.length > NOTE_MAX_LENGTH;
  const showNoteLength = note.length >= NOTE_LENGTH_HINT_FROM;

  const visibleActions = showAllActions
    ? detail.recentActions
    : detail.recentActions.slice(0, COLLAPSED_ACTION_COUNT);
  const hasMoreActions = !showAllActions && detail.recentActions.length > COLLAPSED_ACTION_COUNT;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3.5 border-b border-line pb-4 pr-8">
        <div
          aria-hidden
          className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-sage/15 text-[20px] font-bold text-ink"
        >
          {detail.name.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-bold text-ink">{detail.name}</span>
            <UserStatusBadge status={detail.status} />
          </div>
          <p className="mt-0.5 text-[12px] text-charcoal-3">{detail.studentId}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <SectionLabel>계정 · 조회 전용</SectionLabel>
        <dl className="grid grid-cols-2 gap-2">
          <Field label="휴대폰 번호" span2>
            <span className="inline-flex items-center gap-2">
              {revealedPhone ?? detail.maskedPhone}
              {revealedPhone === null && (
                <button
                  type="button"
                  onClick={onRevealPhone}
                  disabled={isRevealingPhone}
                  className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
                >
                  {isRevealingPhone && <ButtonSpinner />}번호 확인
                </button>
              )}
            </span>
          </Field>
          <Field label="휴대폰 인증">{detail.phoneVerified ? '인증 완료' : '미인증'}</Field>
          <Field label="소속 학과">{detail.major || '미입력'}</Field>
          <Field label="가입일">{formatDateKst(detail.createdAt)}</Field>
          {/* 기존 회원은 마지막 로그인을 백필하지 않아 null 이 온다 — 빈칸 대신 없다고 말한다. */}
          <Field label="마지막 로그인">
            {detail.lastLoginAt ? formatDateTimeKst(detail.lastLoginAt) : '기록 없음'}
          </Field>
        </dl>

        <SectionLabel className="mt-6">가입 동아리 · {detail.clubs.length}개</SectionLabel>
        {detail.clubs.length === 0 ? (
          <p className="text-[12.5px] text-charcoal-3">가입한 동아리가 없습니다</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.clubs.map((club) => (
              <li key={club.clubId}>
                <Link
                  href={`/admin/clubs/${club.clubId}`}
                  className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 transition-colors hover:bg-graysoft"
                >
                  {/* 동아리 이니셜 블록 — 이름 바로 옆이라 읽어주면 중복이 된다. */}
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-ink-deep font-mono text-[13px] font-bold text-paper"
                  >
                    {club.clubName.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-ink">
                      {club.clubName}
                    </span>
                    {/* hover 배경(graysoft)에서 charcoal-3 은 4.01:1 로 AA 에 못 미친다. */}
                    <span className="block text-[11.5px] text-charcoal-2">
                      가입 {formatDateKst(club.joinedAt)}
                    </span>
                  </span>
                  <span className="rounded-full bg-graysoft px-2 py-0.5 text-[11px] font-semibold text-charcoal-2">
                    {clubMemberRoleLabel(club.role)}
                  </span>
                  {/* 이동 가능하다는 신호 — 링크 전체가 클릭 대상이라 화살표는 장식이다. */}
                  <ArrowRight aria-hidden size={15} className="shrink-0 text-charcoal-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <SectionLabel className="mt-6">관리자 메모 · 사용자 비공개</SectionLabel>
        {/* placeholder 는 크림 배경 위 charcoal-3 이 4.24:1 로 AA 미달이라 charcoal-2 를 쓴다. */}
        <textarea
          aria-label="관리자 메모"
          value={note}
          maxLength={NOTE_MAX_LENGTH}
          // 상한에 걸려 저장이 막힌 사실은 스크린리더에도 닿아야 한다 — 라벨만으로는 전달되지 않는다.
          // 카운터가 없는 동안에는 참조를 걸지 않는다 — 없는 id 를 가리키면 접근성 검사가 위반으로 잡는다.
          aria-describedby={showNoteLength ? 'admin-note-length' : undefined}
          onChange={(event) => setNote(event.target.value)}
          placeholder="이 회원에 대한 내부 메모를 남겨주세요"
          className="min-h-[84px] w-full rounded-xl border border-line bg-cream px-3 py-2.5 text-[13px] text-charcoal placeholder:text-charcoal-2 focus-visible:border-ink focus-visible:outline-none"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {/* 작업자가 탈퇴하면 백엔드가 수정 시각만 남기고 이름을 null 로 내린다 — 조치 이력과 같은 문구로 받는다. */}
          <span className="text-[11px] text-charcoal-2">
            {noteUpdatedAt
              ? `최종 수정 ${noteUpdatedAt} · ${detail.adminNoteUpdatedBy ?? '알 수 없음'}`
              : ''}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {/* 입력을 실제로 끊는 건 maxLength 이고 그건 원문 길이를 본다 — 카운터도 같은 값을 센다. */}
            {showNoteLength && (
              <span
                id="admin-note-length"
                className={`text-[11px] ${isNoteOverLimit ? 'text-danger' : 'text-charcoal-2'}`}
              >
                {note.length}/{NOTE_MAX_LENGTH}
              </span>
            )}
            <button
              type="button"
              onClick={() => onSaveNote(note)}
              disabled={isSavingNote || isNoteOverLimit}
              className="btn btn-sm btn-secondary"
            >
              {isSavingNote && <ButtonSpinner />}메모 저장
            </button>
          </div>
        </div>

        <SectionLabel className="mt-6">최근 운영 기록</SectionLabel>
        {detail.recentActions.length === 0 ? (
          <p className="text-[12.5px] text-charcoal-3">기록이 없습니다</p>
        ) : (
          <ul className="flex flex-col">
            {visibleActions.map((entry, index) => (
              // 점과 이어지는 선으로 사건의 순서를 드러낸다 — 왼쪽 테두리 한 줄로는 항목 사이 경계가
              // 흐려 어디까지가 한 조치인지 읽기 어렵다.
              <li key={`${entry.at}-${index}`} className="flex gap-3">
                <div aria-hidden className="flex flex-col items-center">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sage" />
                  {/* 1px 은 이 배경색(line)에서 거의 보이지 않아 점만 떠 있는 것처럼 읽힌다. */}
                  {index < visibleActions.length - 1 && <span className="w-0.5 flex-1 bg-line" />}
                </div>
                <div className={index < visibleActions.length - 1 ? 'pb-3' : ''}>
                  <p className="text-[12.5px] font-semibold text-ink">
                    {ADMIN_USER_ACTION_LABEL[entry.action] ?? entry.action}
                  </p>
                  {/* 사유를 필수로 받으면서 어디에도 보여주지 않으면 받는 의미가 없다. */}
                  {entry.reason && (
                    <p className="mt-0.5 text-[12px] text-charcoal-2">{entry.reason}</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-charcoal-3">
                    {entry.actorName ?? '알 수 없음'} · {formatDateTimeKst(entry.at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {/* 서버가 이미 최근 20건을 함께 내려주므로 펼치는 데 추가 조회가 없다.
            기본 3건으로 접는 이유는 아래 접힌 내용이 아니라 위쪽 위험 작업·메모를 가리지 않기 위해서다. */}
        {hasMoreActions && (
          <button
            type="button"
            onClick={() => setShowAllActions(true)}
            className="btn btn-sm btn-secondary mt-3 w-full"
          >
            전체 기록 보기 · {detail.recentActions.length}건
          </button>
        )}

        {/* 위험 작업은 패널 맨 아래에 둔다 — 정보를 읽는 흐름 중간에 파괴적 버튼이 끼면 스크롤하다
            잘못 누르기 쉽고, 조치는 정보를 다 확인한 뒤에 하는 일이라 순서도 그쪽이 맞다. */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-danger/25">
          <p className="pill-coral flex items-center gap-1.5 border-b border-danger/20 px-4 py-2.5 text-[12.5px] font-bold">
            <Info aria-hidden size={15} />
            위험 작업
          </p>
          <div className="flex flex-col gap-3 bg-danger/[0.04] p-4">
            <DangerRow
              title="강제 로그아웃"
              description="모든 활성 세션을 즉시 종료합니다. 계정 상태는 유지됩니다."
              actionLabel="로그아웃"
              onAction={onForceLogout}
            />
            {detail.status === 'ACTIVE' ? (
              <DangerRow
                title="계정 정지"
                description="세션을 종료하고 로그인·API 접근을 차단합니다."
                actionLabel="계정 정지"
                onAction={onSuspend}
                disabledReason={suspendBlockedReason(detail, currentUserId)}
              />
            ) : (
              <DangerRow
                title="계정 정지 해제"
                description="다시 정상적으로 로그인할 수 있게 합니다."
                actionLabel="정지 해제"
                onAction={onUnsuspend}
                // 해제는 되돌리는 쪽이라 파괴적 강조를 쓰지 않는다 — 확인 다이얼로그와 같은 기준이다.
                // 트리거와 확정 버튼의 색이 어긋나면 무엇을 하는 버튼인지 색으로 읽히지 않는다.
                destructive={false}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const SectionLabel = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) => <p className={`mb-2.5 text-[12px] font-bold text-charcoal-2 ${className}`}>{children}</p>;

const Field = ({
  label,
  children,
  span2,
}: {
  label: string;
  children: React.ReactNode;
  span2?: boolean;
}) => (
  <div className={`rounded-xl border border-line bg-cream px-3 py-2 ${span2 ? 'col-span-2' : ''}`}>
    <dt className="text-[10.5px] text-charcoal-2">{label}</dt>
    <dd className="mt-0.5 text-[12.5px] font-semibold text-ink">{children}</dd>
  </div>
);

const DangerRow = ({
  title,
  description,
  actionLabel,
  onAction,
  disabledReason = null,
  destructive = true,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  /** 값이 있으면 버튼을 잠그고 그 사유를 설명 대신 보여준다. */
  disabledReason?: string | null;
  /** 되돌리는 조치(정지 해제)는 false — 위험 작업 영역 안이어도 파괴적 강조를 쓰지 않는다. */
  destructive?: boolean;
}) => (
  <div className="flex items-center gap-3">
    <div className="flex-1">
      <p className="text-[13px] font-bold text-ink">{title}</p>
      {/* 사유는 title 툴팁이 아니라 화면 텍스트로 둔다 — 잠긴 버튼은 포커스를 받지 못해
          툴팁이 키보드·스크린리더에 닿지 않는다. 잠근 이유는 잠근 사실만큼 중요하다. */}
      <p className={`mt-0.5 text-[11.5px] ${disabledReason ? 'text-danger' : 'text-charcoal-2'}`}>
        {disabledReason ?? description}
      </p>
    </div>
    <button
      type="button"
      onClick={onAction}
      disabled={disabledReason !== null}
      className={destructive ? DANGER_BUTTON_CLASS : 'btn btn-sm btn-secondary shrink-0'}
    >
      {actionLabel}
    </button>
  </div>
);

type Props = {
  userId: number;
  onClose: () => void;
  onSuspend: (detail: AdminUserDetail) => void;
  onUnsuspend: (detail: AdminUserDetail) => void;
  onForceLogout: (detail: AdminUserDetail) => void;
};

export function AdminUserDetailSheet({
  userId,
  onClose,
  onSuspend,
  onUnsuspend,
  onForceLogout,
}: Props) {
  const { addToast } = useToast();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const detailQuery = useAdminUserDetailQuery(userId);
  const revealPhone = useAdminUserPhoneMutation();
  const saveNote = useAdminUserNoteMutation();

  // 원본 번호는 컴포넌트 로컬 상태에만 둔다 — 쿼리 캐시에는 안 남지만 뮤테이션 캐시에는 gcTime 동안
  // 남으므로, 로컬 state 를 비우는 것만으로는 부족하다. reset() 을 함께 불러야 `revealPhone.data` 로
  // 감사 로그 없이 번호가 다시 보이는 경로가 닫힌다.
  const [revealedPhone, setRevealedPhone] = useState<string | null>(null);

  useEffect(() => {
    setRevealedPhone(null);
    revealPhone.reset();
    // 패널이 닫히면 컴포넌트가 언마운트돼 다음 열람은 새 옵저버에서 시작한다(reset 불필요).
    // revealPhone 은 매 렌더 새 객체라 의존성에 넣으면 매 렌더 초기화된다 — 대상이 바뀔 때만 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const detail = detailQuery.data;

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="w-full max-w-[460px] overflow-hidden px-5 py-5">
        <SheetHeader className="sr-only">
          <SheetTitle>회원 상세</SheetTitle>
          <SheetDescription>회원의 계정 정보·가입 동아리·조치 이력을 확인합니다.</SheetDescription>
        </SheetHeader>

        {detailQuery.isLoading && (
          <ListRowsSkeleton rows={6} rowClassName="h-12 rounded-md" label="회원 상세 불러오는 중" />
        )}
        {detailQuery.isError && (
          <ErrorState
            message="회원 정보를 불러오지 못했어요."
            onRetry={() => void detailQuery.refetch()}
          />
        )}
        {detail && (
          <AdminUserDetailSheetContent
            detail={detail}
            currentUserId={currentUserId}
            revealedPhone={revealedPhone}
            isRevealingPhone={revealPhone.isPending}
            isSavingNote={saveNote.isPending}
            onRevealPhone={() =>
              revealPhone.mutate(userId, {
                onSuccess: (result) => setRevealedPhone(result.phone),
                onError: () => addToast('번호를 불러오지 못했어요.', { variant: 'error' }),
              })
            }
            onSaveNote={(note) =>
              saveNote.mutate(
                { userId, note },
                {
                  onSuccess: () => addToast('메모를 저장했어요.'),
                  onError: () => addToast('메모 저장에 실패했어요.', { variant: 'error' }),
                },
              )
            }
            onSuspend={() => onSuspend(detail)}
            onUnsuspend={() => onUnsuspend(detail)}
            onForceLogout={() => onForceLogout(detail)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
