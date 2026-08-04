import { AdminFeeClubDetailPage } from './_pages/AdminFeeClubDetailPage';

type Props = {
  params: Promise<{ clubId: string }>;
};

export default async function Page({ params }: Props) {
  const { clubId } = await params;
  return <AdminFeeClubDetailPage clubId={Number(clubId)} />;
}
