import { notFound } from 'next/navigation';
import { SubmissionBatchDetailPage } from './_pages/SubmissionBatchDetailPage';

type Props = {
  params: Promise<{ batchId: string }>;
};

export default async function Page({ params }: Props) {
  const { batchId } = await params;
  const parsedBatchId = Number(batchId);
  // 숫자가 아니거나 양의 정수가 아니면(빈 값·소수·음수 포함) 존재하지 않는 배치로 취급한다.
  if (!Number.isInteger(parsedBatchId) || parsedBatchId <= 0) notFound();
  return <SubmissionBatchDetailPage batchId={parsedBatchId} />;
}
