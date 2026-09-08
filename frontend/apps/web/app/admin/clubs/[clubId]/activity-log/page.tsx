import { AdminClubActivityLogPage } from './_pages/AdminClubActivityLogPage';

type Props = {
  params: Promise<{ clubId: string }>;
};

export default async function Page({ params }: Props) {
  const { clubId } = await params;
  return <AdminClubActivityLogPage clubId={Number(clubId)} />;
}
