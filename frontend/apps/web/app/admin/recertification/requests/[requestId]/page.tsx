import { AdminRecertificationRequestDetailPage } from '../_pages/AdminRecertificationRequestDetailPage';

type Props = {
  params: Promise<{ requestId: string }>;
};

export default async function Page({ params }: Props) {
  const { requestId } = await params;
  return <AdminRecertificationRequestDetailPage requestId={Number(requestId)} />;
}
