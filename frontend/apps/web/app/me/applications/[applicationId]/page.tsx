import { notFound } from 'next/navigation';

import { parsePositiveIdParam } from '@/app/_lib/idParam';

import { ApplicationsPage } from '../_pages/ApplicationsPage';

type PageProps = {
  params: Promise<{ applicationId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { applicationId } = await params;
  // 양의 정수가 아닌 id 는 어떤 지원서도 가리키지 않는다 — 평범한 목록을 조용히 보여주지 않고 여기서 끊는다.
  if (parsePositiveIdParam(applicationId) === null) {
    notFound();
  }
  return <ApplicationsPage defaultOpenId={applicationId} />;
}
