import { AdminClubMemberHistoryPage } from './_pages/AdminClubMemberHistoryPage';

type Props = {
  params: Promise<{ clubId: string }>;
};

export default async function Page({ params }: Props) {
  const { clubId } = await params;
  return <AdminClubMemberHistoryPage clubId={Number(clubId)} />;
}
