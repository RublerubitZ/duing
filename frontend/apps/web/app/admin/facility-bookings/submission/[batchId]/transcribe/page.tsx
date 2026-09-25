import { notFound } from 'next/navigation';
import { parsePositiveIdParam } from '@/app/_lib/idParam';
import { TranscribeCockpitPage } from './_pages/TranscribeCockpitPage';

type Props = {
  params: Promise<{ batchId: string }>;
};

export default async function Page({ params }: Props) {
  const { batchId } = await params;
  const parsedBatchId = parsePositiveIdParam(batchId);
  // 숫자가 아니거나 양의 정수가 아니면(빈 값·소수·음수 포함) 존재하지 않는 배치로 취급한다.
  if (parsedBatchId === null) notFound();
  return <TranscribeCockpitPage batchId={parsedBatchId} />;
}
