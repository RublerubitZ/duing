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
import type { AdminUserDetail } from '@duing/types';

import { useToast } from '@/app/_components/toast/ToastProvider';
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

import { ADMIN_USER_ACTION_LABEL } from '../_lib/userActionLabels';
import { UserStatusBadge } from './UserStatusBadge';

// 서버 검증은 Bean Validation 의 @Size 라 UTF-16 코드유닛으로 센다. 클라이언트도 같은 단위여야 한다 —
// `[...str].length` 나 Intl.Segmenter 로 세면(코드포인트/서체소) 이모지가 섞인 메모에서 FE 는 통과시키고
// 서버가 400 을 낸다. textarea 의 maxLength 와 `str.length` 가 정확히 그 단위다.
const NOTE_MAX_LENGTH = 1000;

// 위험 작업 버튼은 레포 공통 파괴적 액션 스타일을 그대로 쓴다(삭제·강제 로그아웃 다이얼로그 전례).
const DANGER_BUTTON_CLASS =
  'btn btn-sm shrink-0 bg-coral text-paper transition-colors hover:bg-[#c2603f]';

type ContentProps = {
  detail: AdminUserDetail;
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

  // 다른 회원으로 패널이 바뀌면 메모 입력값을 그 회원 것으로 다시 시드한다.
  // detail.adminNote 는 의존성에서 뺀다 — 넣으면 저장 후 재조회(상태 변경 뮤테이션이 목록 접두사를
  // 무효화해 상세까지 덮는 경로 포함)가 착지하는 순간 그 사이 타이핑한 내용을 경고 없이 되돌린다.
  // 대신 서버가 값을 정규화해도 입력창은 사용자가 친 그대로 남는다 — 표시가 한 박자 어긋나는 쪽이
  // 입력이 조용히 사라지는 것보다 낫다고 판단했다.
  useEffect(() => {
    setNote(detail.adminNote ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.id]);

  const noteUpdatedAt = detail.adminNoteUpdatedAt ? formatDateTimeKst(detail.adminNoteUpdatedAt) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line pb-4 pr-8">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sage/15 text-[18px] font-bold text-ink">
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
          <button
            type="button"
            onClick={() => onSaveNote(note)}
            disabled={isSavingNote}
            className="btn btn-sm btn-secondary shrink-0"
          >
            {isSavingNote && <ButtonSpinner />}메모 저장
          </button>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-coral/30">
          {/* pill-coral(#fce2d9 배경 / #9a3f23 글자)은 레포에서 대비를 맞춰 둔 코랄 조합이다.
              옅은 배경 위 text-coral 은 3.1:1 이라 작은 글자에서 WCAG AA 에 못 미친다. */}
          <p className="pill-coral border-b border-coral/20 px-4 py-2.5 text-[12.5px] font-bold">
            위험 작업
          </p>
          <div className="flex flex-col gap-3 bg-coral/[0.04] p-4">
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
              />
            ) : (
              <DangerRow
                title="계정 정지 해제"
                description="다시 정상적으로 로그인할 수 있게 합니다."
                actionLabel="정지 해제"
                onAction={onUnsuspend}
              />
            )}
          </div>
        </div>

        <SectionLabel className="mt-6">최근 운영 기록</SectionLabel>
        {detail.recentActions.length === 0 ? (
          <p className="text-[12.5px] text-charcoal-3">기록이 없습니다</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {detail.recentActions.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="border-l-2 border-line pl-3">
                <p className="text-[12.5px] font-semibold text-ink">
                  {ADMIN_USER_ACTION_LABEL[entry.action] ?? entry.action}
                </p>
                {/* 사유를 필수로 받으면서 어디에도 보여주지 않으면 받는 의미가 없다. */}
                {entry.reason && <p className="mt-0.5 text-[12px] text-charcoal-2">{entry.reason}</p>}
                <p className="mt-0.5 text-[11px] text-charcoal-3">
                  {entry.actorName ?? '알 수 없음'} · {formatDateTimeKst(entry.at)}
                </p>
              </li>
            ))}
          </ul>
        )}
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
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) => (
  <div className="flex items-center gap-3">
    <div className="flex-1">
      <p className="text-[13px] font-bold text-ink">{title}</p>
      <p className="mt-0.5 text-[11.5px] text-charcoal-2">{description}</p>
    </div>
    <button type="button" onClick={onAction} className={DANGER_BUTTON_CLASS}>
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
          <p className="py-12 text-center text-[13px] text-coral">회원 정보를 불러오지 못했습니다.</p>
        )}
        {detail && (
          <AdminUserDetailSheetContent
            detail={detail}
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
