import { redirect } from 'next/navigation';

import { toRoute } from '@/app/_lib/route';

export default async function MemberRootPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  redirect(toRoute(`/clubs/${clubId}/member/notices`));
}
