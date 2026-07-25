'use client';

import type { ReactNode } from 'react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import type { ClubMember, ClubMemberRole, MemberFeeStatus } from '@duing/types';
import { GRADE_DISPLAY_NAME } from '@duing/types';
import {
  formatDateKst,
  useLeaveClubMutation,
  useRemoveMemberMutation,
  useUpdateMemberGenerationMutation,
  useUpdateMemberRoleMutation,
} from '@duing/hooks';

import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { clubMemberRoleLabel } from '@/app/_lib/clubMemberRoleLabel';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { X } from '@/components/duing/Icon';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { RemoveMemberDialog } from './RemoveMemberDialog';
import { formatMembershipDuration } from '../_lib/membershipDuration';

type MemberDetailPanelProps = {
  member: ClubMember | null;
  clubId: number;
  useGeneration: boolean;
  viewerRole: ClubMemberRole;
  viewerUserId: number;
  open: boolean;
  onClose: () => void;
  // 회장 인계 확인 다이얼로그는 동아리명을 요구하므로 페이지 레벨 단일 다이얼로그로 띄운다(기존 패턴). 패널은 트리거만.
  onTransferLeader: (target: ClubMember) => void;
};

// 뷰포트에 따라 렌더 컨테이너를 고른다 — 데스크탑(lg+)은 인라인 컬럼, 태블릿(md~lg)은 우측 Sheet,
// 모바일(<md)은 풀스크린 Dialog. Radix Sheet/Dialog 는 포털·스크림이라 CSS 로만 게이트할 수 없어
// matchMedia 로 하나만 마운트한다(useIsMobileViewport 전례와 동일한 useSyncExternalStore 패턴).
type PanelMode = 'inline' | 'sheet' | 'dialog';
const DESKTOP_QUERY = '(min-width: 1024px)';
const TABLET_QUERY = '(min-width: 768px)';

function readPanelMode(): PanelMode {
  if (window.matchMedia(DESKTOP_QUERY).matches) return 'inline';
  if (window.matchMedia(TABLET_QUERY).matches) return 'sheet';
  return 'dialog';
}

function subscribePanelMode(onChange: () => void): () => void {
  const desktop = window.matchMedia(DESKTOP_QUERY);
  const tablet = window.matchMedia(TABLET_QUERY);
  desktop.addEventListener('change', onChange);
  tablet.addEventListener('change', onChange);
  return () => {
    desktop.removeEventListener('change', onChange);
    tablet.removeEventListener('change', onChange);
  };
}

function usePanelMode(): PanelMode {
  // SSR·초기 스냅샷은 데스크탑(inline) — 하이드레이션 mismatch 방지(useIsMobileViewport 전례).
  return useSyncExternalStore(subscribePanelMode, readPanelMode, () => 'inline');
}

const FEE_DISPLAY: Record<MemberFeeStatus, { label: string; dotClass: string }> = {
  PAID: { label: '납부', dotClass: 'bg-sage' },
  UNPAID: { label: '미납', dotClass: 'bg-coral' },
  NONE: { label: '관리 대상 아님', dotClass: 'bg-charcoal-3/40' },
};

const EMPTY = '—';

export function MemberDetailPanel({
  member,
  clubId,
  useGeneration,
  viewerRole,
  viewerUserId,
  open,
  onClose,
  onTransferLeader,
}: MemberDetailPanelProps) {
  const mode = usePanelMode();

  if (!open || !member) return null;

  const body = (
    <PanelBody
      // 회원이 바뀌면 본문을 새로 마운트한다 — 앞 회원의 실패 메시지·열린 다이얼로그가
      // 다음 회원 화면에 남아 남의 실패를 이 사람 것으로 오독하게 만든다.
      key={member.memberId}
      member={member}
      clubId={clubId}
      useGeneration={useGeneration}
      viewerRole={viewerRole}
      viewerUserId={viewerUserId}
      onClose={onClose}
      onTransferLeader={onTransferLeader}
    />
  );

  const title = `${member.name} 상세`;

  if (mode === 'inline') {
    return (
      <aside aria-label={title} className="card overflow-hidden">
        {body}
      </aside>
    );
  }

  if (mode === 'sheet') {
    return (
      <Sheet open onOpenChange={(next) => !next && onClose()}>
        <SheetContent side="right" hideClose className="w-[88%] max-w-md p-0">
          <SheetTitle className="sr-only">{title}</SheetTitle>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="left-0 top-0 h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none p-0">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {body}
      </DialogContent>
    </Dialog>
  );
}

type PanelBodyProps = {
  member: ClubMember;
  clubId: number;
  useGeneration: boolean;
  viewerRole: ClubMemberRole;
  viewerUserId: number;
  onClose: () => void;
  onTransferLeader: (target: ClubMember) => void;
};

function PanelBody({
  member,
  clubId,
  useGeneration,
  viewerRole,
  viewerUserId,
  onClose,
  onTransferLeader,
}: PanelBodyProps) {
  const isSelf = member.userId === viewerUserId;
  const isLeaderRow = member.role === 'LEADER';
  const isLeaderViewer = viewerRole === 'LEADER';

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sage-mist text-base font-semibold text-ink"
        >
          {member.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-lg font-semibold text-ink-deep">{member.name}</h3>
            {isSelf && (
              <span className="rounded bg-graysoft px-1.5 py-0.5 text-xs text-charcoal-2">본인</span>
            )}
          </div>
          <p className="text-sm text-charcoal-3">{clubMemberRoleLabel(member.role)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-charcoal-3 transition-colors hover:bg-graysoft hover:text-ink"
        >
          <X size={18} />
        </button>
      </header>

      <div className="space-y-6 px-5 py-5">
        <BasicInfoSection member={member} useGeneration={useGeneration} />
        <OperationInfoSection member={member} clubId={clubId} />
        <ManagementSection
          member={member}
          clubId={clubId}
          useGeneration={useGeneration}
          isSelf={isSelf}
          isLeaderRow={isLeaderRow}
          isLeaderViewer={isLeaderViewer}
          viewerRole={viewerRole}
          onTransferLeader={onTransferLeader}
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-sm text-charcoal-3">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-ink-deep">{children}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="mb-1 text-xs font-semibold text-charcoal-2">{children}</h4>;
}

function BasicInfoSection({ member, useGeneration }: { member: ClubMember; useGeneration: boolean }) {
  return (
    <section>
      <SectionTitle>기본 정보</SectionTitle>
      <dl className="divide-y divide-line/60">
        <Field label="학과">{member.major || EMPTY}</Field>
        <Field label="학년">{GRADE_DISPLAY_NAME[member.grade]}</Field>
        <Field label="학번">{member.studentId || EMPTY}</Field>
        <Field label="연락처">
          <ContactValue phoneMasked={member.phoneMasked} />
        </Field>
        <Field label="가입일">{formatDateKst(member.joinedAt)}</Field>
        <Field label="가입 기간">{formatMembershipDuration(member.joinedAt, new Date())}</Field>
        {useGeneration && <Field label="기수">{member.generation === null ? EMPTY : `${member.generation}기`}</Field>}
      </dl>
    </section>
  );
}

// 복사 버튼은 두지 않는다 — 멤버 목록 응답은 마스킹된 번호(phoneMasked)만 내려주므로
// 복사해도 전화를 걸 수 없는 값이 클립보드에 담긴다. "복사됨" 피드백이 성공을 알리면
// 사용자는 붙여넣기 전까지 잘못된 값을 받았다는 사실을 모른다.
// BE 가 리더에게 원본 번호를 제공하게 되면 그때 되살린다.
function ContactValue({ phoneMasked }: { phoneMasked: string | null }) {
  if (!phoneMasked) return <span className="text-charcoal-3">{EMPTY}</span>;
  return <span className="font-mono">{phoneMasked}</span>;
}

function OperationInfoSection({ member, clubId }: { member: ClubMember; clubId: number }) {
  const fee = FEE_DISPLAY[member.feeStatus];
  return (
    <section>
      <SectionTitle>운영 정보</SectionTitle>
      <dl className="divide-y divide-line/60">
        <Field label="역할">{clubMemberRoleLabel(member.role)}</Field>
        <Field label="회비 상태">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn('h-2 w-2 rounded-full', fee.dotClass)} />
            {fee.label}
          </span>
        </Field>
      </dl>
      <Link
        href={toRoute(`/manage/clubs/${clubId}/fees`)}
        className="mt-2 inline-block text-xs font-medium text-sage hover:underline"
      >
        회비 관리에서 보기
      </Link>
    </section>
  );
}

type ManagementSectionProps = {
  member: ClubMember;
  clubId: number;
  useGeneration: boolean;
  isSelf: boolean;
  isLeaderRow: boolean;
  isLeaderViewer: boolean;
  viewerRole: ClubMemberRole;
  onTransferLeader: (target: ClubMember) => void;
};

// 관리 액션은 LEADER 전용(BE 가 OFFICER 403). OFFICER 뷰어에겐 본인 탈퇴만 노출한다.
function ManagementSection({
  member,
  clubId,
  useGeneration,
  isSelf,
  isLeaderRow,
  isLeaderViewer,
  viewerRole,
  onTransferLeader,
}: ManagementSectionProps) {
  const updateRole = useUpdateMemberRoleMutation(clubId);
  const removeMember = useRemoveMemberMutation(clubId);
  const leaveClub = useLeaveClubMutation(clubId);

  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(nextRole: 'OFFICER' | 'MEMBER') {
    const verb =
      nextRole === 'OFFICER'
        ? `${clubMemberRoleLabel('OFFICER')}으로 승급`
        : `${clubMemberRoleLabel('MEMBER')}으로 강등`;
    if (!window.confirm(`${member.name} 님을 ${verb}할까요?`)) return;
    setError(null);
    try {
      await updateRole.mutateAsync({ memberId: member.memberId, payload: { role: nextRole } });
    } catch (err) {
      setError(err instanceof Error ? err.message : '역할 변경 실패');
    }
  }

  async function doRemove() {
    setError(null);
    try {
      await removeMember.mutateAsync(member.memberId);
      setShowRemoveDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '탈퇴 처리 실패');
    }
  }

  async function confirmLeave() {
    setError(null);
    try {
      await leaveClub.mutateAsync();
      setShowLeaveConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '탈퇴 실패');
    }
  }

  // OFFICER 뷰어: 본인 탈퇴만. 타인은 읽기 전용(관리 섹션 숨김).
  if (!isLeaderViewer) {
    if (viewerRole === 'OFFICER' && isSelf) {
      return (
        <section>
          <SectionTitle>관리</SectionTitle>
          <button
            type="button"
            onClick={() => setShowLeaveConfirm(true)}
            className="rounded-md px-3 py-2 text-sm text-coral hover:bg-coral/5"
          >
            탈퇴
          </button>
          {error && <p className="mt-2 text-xs text-coral">{error}</p>}
          <ConfirmDialog
            open={showLeaveConfirm}
            title="동아리를 탈퇴할까요?"
            description="탈퇴하면 이 동아리에서 빠지며, 되돌리려면 다시 가입해야 합니다."
            confirmLabel="탈퇴"
            isPending={leaveClub.isPending}
            onConfirm={confirmLeave}
            onCancel={() => setShowLeaveConfirm(false)}
          />
        </section>
      );
    }
    return null;
  }

  return (
    <section>
      <SectionTitle>관리</SectionTitle>

      {useGeneration && <GenerationEditor member={member} clubId={clubId} />}

      <div className="mt-3 flex flex-wrap gap-2">
        {/* 본인(회장) 행: 탈퇴 불가 — 회장 인계 후에만 가능 */}
        {isSelf && isLeaderRow && (
          <button
            type="button"
            disabled
            title="회장 인계 후 가능"
            className="cursor-not-allowed rounded-md px-3 py-2 text-sm text-charcoal-3/60"
          >
            탈퇴
          </button>
        )}

        {!isSelf && member.role === 'OFFICER' && (
          <button
            type="button"
            onClick={() => changeRole('MEMBER')}
            className="rounded-md px-3 py-2 text-sm text-charcoal-2 hover:bg-graysoft"
          >
            {clubMemberRoleLabel('MEMBER')}으로 강등
          </button>
        )}
        {!isSelf && member.role === 'MEMBER' && (
          <button
            type="button"
            onClick={() => changeRole('OFFICER')}
            className="rounded-md px-3 py-2 text-sm text-charcoal-2 hover:bg-graysoft"
          >
            {clubMemberRoleLabel('OFFICER')}으로 승급
          </button>
        )}

        {!isSelf && !isLeaderRow && (
          <>
            <button
              type="button"
              onClick={() => onTransferLeader(member)}
              className="rounded-md px-3 py-2 text-sm text-charcoal-2 hover:bg-graysoft"
            >
              회장 인계
            </button>
            <button
              type="button"
              onClick={() => setShowRemoveDialog(true)}
              className="rounded-md px-3 py-2 text-sm text-coral hover:bg-coral/5"
            >
              탈퇴
            </button>
          </>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-coral">{error}</p>}

      {showRemoveDialog && (
        <RemoveMemberDialog
          targetName={member.name}
          isPending={removeMember.isPending}
          onConfirm={doRemove}
          onCancel={() => setShowRemoveDialog(false)}
        />
      )}
    </section>
  );
}

// 기수 수정(useGeneration ON). 양의 정수만 저장, 비우기로 null 저장. BE 400 메시지도 표시한다.
function GenerationEditor({ member, clubId }: { member: ClubMember; clubId: number }) {
  const updateGeneration = useUpdateMemberGenerationMutation(clubId);
  const [value, setValue] = useState(member.generation === null ? '' : String(member.generation));
  const [error, setError] = useState<string | null>(null);

  // 패널이 다른 회원으로 재사용될 때 입력을 그 회원 값으로 다시 시드한다.
  useEffect(() => {
    setValue(member.generation === null ? '' : String(member.generation));
    setError(null);
  }, [member.memberId, member.generation]);

  async function save() {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed) || Number(trimmed) < 1) {
      setError('기수는 1 이상의 정수여야 해요');
      return;
    }
    setError(null);
    try {
      await updateGeneration.mutateAsync({ memberId: member.memberId, payload: { generation: Number(trimmed) } });
    } catch (err) {
      setError(err instanceof Error ? err.message : '기수 저장 실패');
    }
  }

  async function clear() {
    setError(null);
    try {
      await updateGeneration.mutateAsync({ memberId: member.memberId, payload: { generation: null } });
      setValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '기수 저장 실패');
    }
  }

  return (
    <div className="rounded-md border border-line bg-graysoft/40 p-3">
      <label htmlFor="member-generation" className="mb-1.5 block text-xs font-semibold text-charcoal-2">
        기수 수정
      </label>
      <div className="flex items-center gap-2">
        <input
          id="member-generation"
          type="number"
          min={1}
          inputMode="numeric"
          value={value}
          disabled={updateGeneration.isPending}
          onChange={(event) => setValue(event.target.value)}
          placeholder="예: 12"
          className="w-24 rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm text-charcoal focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <button
          type="button"
          onClick={save}
          disabled={updateGeneration.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-paper transition-colors hover:bg-ink-deep disabled:opacity-60"
        >
          {updateGeneration.isPending && <ButtonSpinner />}저장
        </button>
        <button
          type="button"
          onClick={clear}
          // 저장된 기수가 있을 때만 의미가 있다. 입력값으로 판단하면 "손으로 지워서 비우기" 시도가
          // 비우기 비활성 + 저장은 "1 이상" 에러로 막다른 길이 된다.
          disabled={updateGeneration.isPending || member.generation === null}
          className="rounded-md px-2.5 py-1.5 text-sm text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
        >
          비우기
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-coral">{error}</p>}
    </div>
  );
}
