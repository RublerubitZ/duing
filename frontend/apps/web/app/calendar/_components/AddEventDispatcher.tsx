'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useState } from 'react';
import { useBackDismiss } from '@/app/_lib/backDismiss';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useManagedClubsQuery, useMeQuery } from '@duing/hooks';
import type { ManagedClub } from '@duing/types';
import { toRoute } from '../../_lib/route';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AddEventDispatcher({ open, onClose }: Props) {
  const router = useGuardedRouter();
  const meQuery = useMeQuery();
  // 비로그인 시 /leader/clubs/me/managed 호출 자체를 skip — 401 콘솔 노이즈 방지.
  // 비로그인 사용자는 운영 클럽이 있을 수 없으므로 빈 배열 처리와 의미상 동일.
  const isAuthenticated = !!meQuery.data;
  const managedClubsQuery = useManagedClubsQuery({ enabled: isAuthenticated });
  const [selectedClubId, setSelectedClubId] = useState<number | null>(null);
  // EventDetailModal 과 같은 이유로 Radix 프리미티브를 재사용한다(PhotoLightbox 전례).
  // Root 를 직접 쓰므로 뒤로가기 닫기는 여기서 직접 건다.
  useBackDismiss(open, onClose);

  const isAdmin = meQuery.data?.role === 'ADMIN';
  const managedClubs: ManagedClub[] = managedClubsQuery.data ?? [];
  const hasManagedClubs = managedClubs.length > 0;
  const targetClubId = selectedClubId ?? managedClubs[0]?.clubId ?? null;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[480px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-paper p-6 space-y-6 outline-none"
        >
          <header className="flex items-center justify-between">
            {/* Radix 가 이 Title(h2) 을 aria-labelledby 로 연결한다. */}
            <DialogPrimitive.Title className="text-[18px] font-bold text-ink">
              일정 추가
            </DialogPrimitive.Title>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="text-charcoal-3 text-[20px]"
            >
              ×
            </button>
          </header>

          {hasManagedClubs && (
            <Section
              title="동아리 일정 추가"
              description="회원 전용 동아리 일정 페이지로 이동합니다. 등록한 일정은 동아리 회원과 총동연(ADMIN)이 캘린더에서 볼 수 있습니다."
            >
              <ClubSelect
                clubs={managedClubs}
                value={targetClubId}
                onChange={setSelectedClubId}
              />
              <PrimaryButton
                disabled={targetClubId === null}
                onClick={() => {
                  if (targetClubId === null) return;
                  router.push(toRoute(`/clubs/${targetClubId}/member/events`));
                }}
              >
                선택한 동아리 일정 페이지로 이동
              </PrimaryButton>
            </Section>
          )}

          {hasManagedClubs && (
            <Section title="모집 공고" description="모집 마감일이 캘린더에 자동 노출됩니다.">
              <PrimaryButton
                disabled={targetClubId === null}
                onClick={() => {
                  if (targetClubId === null) return;
                  router.push(toRoute(`/manage/clubs/${targetClubId}/recruitments/new`));
                }}
              >
                모집 공고 작성
              </PrimaryButton>
            </Section>
          )}

          {isAdmin && (
            <Section title="총동연 일정 등록" description="비로그인 포함 모든 사용자에게 노출됩니다.">
              <PrimaryButton onClick={() => router.push(toRoute('/admin/global-events/new'))}>
                글로벌 일정 등록
              </PrimaryButton>
            </Section>
          )}

          {!hasManagedClubs && !isAdmin && (
            <p className="text-[13px] text-charcoal-2">
              일정 추가 권한이 없습니다. 동아리 운영진(LEADER/OFFICER) 또는 총동연(ADMIN) 만 사용할 수 있습니다.
            </p>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 border border-line rounded-xl p-4 bg-cream-2">
      <div>
        <h3 className="text-[14px] font-bold text-ink">{title}</h3>
        <p className="text-[12px] text-charcoal-3">{description}</p>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function ClubSelect({
  clubs,
  value,
  onChange,
}: {
  clubs: ManagedClub[];
  value: number | null;
  onChange: (next: number) => void;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(changeEvent) => onChange(Number(changeEvent.target.value))}
      className="px-3 py-2 rounded-md border border-line bg-paper text-[13px]"
    >
      {clubs.map((club) => (
        <option key={club.clubId} value={club.clubId}>
          {club.clubName} ({club.myRole})
        </option>
      ))}
    </select>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 rounded-full bg-ink text-paper text-[13px] font-semibold disabled:opacity-50"
    >
      {children}
    </button>
  );
}
