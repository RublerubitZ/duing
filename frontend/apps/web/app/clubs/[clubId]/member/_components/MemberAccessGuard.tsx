'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useClubMembershipQuery } from '@duing/hooks';
import { MembershipProvider } from './MembershipContext';

type Props = { clubId: number; children: React.ReactNode };

export function MemberAccessGuard({ clubId, children }: Props) {
  const router = useRouter();
  const { data, isLoading, isError, error } = useClubMembershipQuery(clubId);

  useEffect(() => {
    if (!isError) return;
    const status = (error as { response?: { status?: number } })?.response?.status;
    // 비-멤버(403) 또는 클럽 없음(404) 모두 공개 페이지로 redirect
    if (status === 404 || status === 403) {
      alert('회원 전용 페이지입니다. 동아리 소개 페이지로 이동합니다.');
      router.replace(`/clubs/${clubId}`);
    }
  }, [isError, error, router, clubId]);

  if (isLoading) {
    return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  }
  if (!data) return null;

  return <MembershipProvider membership={data}>{children}</MembershipProvider>;
}
