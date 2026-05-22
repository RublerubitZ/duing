import { AdminSuccessionDetailPage } from '../_pages/AdminSuccessionDetailPage';

type Props = {
  params: Promise<{ requestId: string }>;
};

export default async function Page({ params }: Props) {
  const { requestId } = await params;
  return <AdminSuccessionDetailPage requestId={Number(requestId)} />;
}
