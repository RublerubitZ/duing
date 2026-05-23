import { AdminPromotionRequestDetailPage } from '../_pages/AdminPromotionRequestDetailPage';

type Props = {
  params: Promise<{ requestId: string }>;
};

export default async function Page({ params }: Props) {
  const { requestId } = await params;
  return <AdminPromotionRequestDetailPage requestId={Number(requestId)} />;
}
