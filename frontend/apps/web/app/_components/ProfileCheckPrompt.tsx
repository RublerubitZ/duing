'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { ApiError } from '@duing/api';
import { useConfirmProfileCheckMutation, useMeQuery, useProfileCheckQuery } from '@duing/hooks';

import { ProfileCheckActions, ProfileCheckBody } from '@/app/_components/ProfileCheckPanel';
import { ProfileEditDialog } from '@/app/_components/ProfileEditDialog';
import { useToast } from '@/app/_components/toast/ToastProvider';
import {
  dismissProfileCheckForDocument,
  isProfileCheckHidden,
  snoozeProfileCheck,
} from '@/app/_lib/profileCheckSnooze';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';

// Tailwind md 의 정확한 여집합으로 판정한다 — (max-width: 767px) 로 쓰면 767~768px 소수 폭이 어느 쪽에도 안 든다(#1480).
const DESKTOP_QUERY = '(min-width: 768px)';

function subscribeViewport(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const mediaQueryList = window.matchMedia(DESKTOP_QUERY);
  mediaQueryList.addEventListener('change', onChange);
  return () => mediaQueryList.removeEventListener('change', onChange);
}

function readIsMobileViewport(): boolean {
  return typeof window.matchMedia === 'function' && !window.matchMedia(DESKTOP_QUERY).matches;
}

// 늦게 도착한 팝업이 입력 중인 키보드를 닫거나 이미 열린 시트·다이얼로그 위에 겹치지 않게 — 이번 진입은 건너뛴다.
function isUserBusyElsewhere(): boolean {
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    (activeElement instanceof HTMLElement && activeElement.isContentEditable)
  ) {
    return true;
  }
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

type OpenDecision = { key: string; show: boolean };

/**
 * 학기별 정보 확인 팝업(스펙 §6.2) — 홈·마이페이지에만 둔다. 로그인 사용자에게만 조회하고, 서버가 pending 이라고 할 때
 * 모바일은 하단 시트·PC 는 가운데 다이얼로그 하나만 띄운다. 서버·미인증·로딩·조회 실패에서는 아무것도 그리지 않는다.
 */
export function ProfileCheckPrompt() {
  const statusQuery = useProfileCheckQuery();
  const meQuery = useMeQuery();
  const confirmMutation = useConfirmProfileCheckMutation();
  const { addToast } = useToast();
  // SSR·하이드레이션 첫 스냅샷은 PC — 팝업은 데이터가 온 뒤에만 열려 이 값이 첫 화면에 나가지 않는다.
  const isMobileViewport = useSyncExternalStore(subscribeViewport, readIsMobileViewport, () => false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [decision, setDecision] = useState<OpenDecision | null>(null);
  const [closed, setClosed] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const status = statusQuery.data;
  const me = meQuery.data;
  const userId = me?.id ?? null;
  const semesterYear = status?.pending === true ? status.semesterYear : null;
  const semesterTerm = status?.pending === true ? status.semesterTerm : null;
  const targetKey =
    userId !== null && semesterYear !== null && semesterTerm !== null
      ? `${userId}:${semesterYear}-${semesterTerm}`
      : null;

  // 띄울지는 사용자·학기가 갖춰진 첫 순간 한 번만 정한다 — 숨김(나중에·이 문서에서 닫음)과 여는 순간 가드.
  useEffect(() => {
    if (userId === null || semesterYear === null || semesterTerm === null) return;
    const key = `${userId}:${semesterYear}-${semesterTerm}`;
    setDecision((previous) =>
      previous?.key === key
        ? previous
        : {
            key,
            show:
              !isProfileCheckHidden({ userId, semesterYear, semesterTerm }, Date.now()) && !isUserBusyElsewhere(),
          },
    );
  }, [userId, semesterYear, semesterTerm]);

  if (status?.pending !== true || me === undefined) return null;

  const target = { userId: me.id, semesterYear: status.semesterYear, semesterTerm: status.semesterTerm };
  const open = !closed && decision !== null && decision.key === targetKey && decision.show;
  const isPending = confirmMutation.isPending;

  const handleOpenChange = (nextOpen: boolean) => {
    // 전송 중에는 어떤 경로로도 닫지 않는다 — 거부하면 뒤로가기 엔트리는 그대로 남는다(backDismiss 규약).
    if (nextOpen || isPending) return;
    dismissProfileCheckForDocument(target);
    setClosed(true);
  };

  const handleSnooze = () => {
    snoozeProfileCheck(target, Date.now());
    setClosed(true);
  };

  const handleConfirm = () => {
    setErrorMessage(null);
    confirmMutation.mutate(
      { semesterYear: status.semesterYear, semesterTerm: status.semesterTerm, grade: status.suggestedGrade },
      {
        onSuccess: (outcome) => {
          setClosed(true);
          addToast(
            outcome === 'alreadyConfirmedElsewhere'
              ? '이미 다른 곳에서 확인해서 학년은 바뀌지 않았어요.'
              : '정보를 확인했어요.',
          );
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'PROFILE_CHECK_CLOSED') {
            setClosed(true);
            addToast('지금은 정보 확인 기간이 아니에요.');
            return;
          }
          setErrorMessage(
            error instanceof ApiError ? error.message : '확인에 실패했어요. 잠시 후 다시 시도해 주세요.',
          );
        },
      },
    );
  };

  // Enter 한 번으로 학년이 바뀌지 않게 열릴 때 주 버튼이 아니라 제목에 포커스를 둔다.
  const focusTitle = (event: Event) => {
    event.preventDefault();
    titleRef.current?.focus();
  };

  const body = <ProfileCheckBody status={status} titleRef={titleRef} />;
  const actionProps = {
    suggestedGrade: status.suggestedGrade,
    isPending,
    errorMessage,
    onConfirm: handleConfirm,
    onEdit: () => setEditOpen(true),
    onSnooze: handleSnooze,
  };

  return (
    <>
      {isMobileViewport ? (
        <Sheet open={open} onOpenChange={handleOpenChange}>
          {/* 컨테이너 하단 패딩 0 — 하단 고정 액션이 세이프에어리어 여백을 직접 가진다(MobileDaySheet 전례, sticky 푸터 들뜸 방지). */}
          <SheetContent
            side="bottom"
            hideClose
            busy={isPending}
            onOpenAutoFocus={focusTitle}
            className="px-6 pb-0 pt-3"
          >
            <div aria-hidden="true" className="mx-auto mb-4 h-1 w-9 rounded-full bg-line" />
            {body}
            <div className="sticky bottom-0 -mx-6 mt-6 border-t border-line bg-card px-6 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-3">
              <ProfileCheckActions layout="stacked" {...actionProps} />
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={handleOpenChange}>
          {/* 운영진 문구가 길어도 버튼이 화면 밖으로 나가지 않게 높이 상한을 두고 본문만 스크롤한다. */}
          <DialogContent
            busy={isPending}
            onOpenAutoFocus={focusTitle}
            className="flex max-h-[calc(100dvh-4rem)] w-[calc(100%-2rem)] max-w-[420px] flex-col gap-0 p-0"
          >
            <div className="min-h-0 overflow-y-auto px-7 pt-7">{body}</div>
            <div className="px-7 pb-7 pt-5">
              <ProfileCheckActions layout="inline" {...actionProps} />
            </div>
          </DialogContent>
        </Dialog>
      )}
      {/* 팝업 위에 겹쳐 연다(팝업은 열린 채) — 저장 성공은 서버가 확인으로 기록하므로 팝업을 바로 닫는다. */}
      <ProfileEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => setClosed(true)}
        currentName={me.name}
        currentGrade={me.grade}
        currentCollege={me.college}
        currentMajor={me.major}
      />
    </>
  );
}
