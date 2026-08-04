import { AdminRecruitmentDetailPage } from '../_pages/AdminRecruitmentDetailPage';

type Props = {
  params: Promise<{ recruitmentId: string }>;
};

export default async function Page({ params }: Props) {
  const { recruitmentId } = await params;
  return <AdminRecruitmentDetailPage recruitmentId={Number(recruitmentId)} />;
}
