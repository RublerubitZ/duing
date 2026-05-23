import { AdminClubDetailPage } from './_pages/AdminClubDetailPage';

type Props = {
  params: Promise<{ clubId: string }>;
};

export default async function Page({ params }: Props) {
  const { clubId } = await params;
  return <AdminClubDetailPage clubId={Number(clubId)} />;
}
