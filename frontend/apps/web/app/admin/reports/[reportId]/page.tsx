import { AdminReportDetailPage } from '../_pages/AdminReportDetailPage';

type Props = {
  params: Promise<{ reportId: string }>;
};

export default async function Page({ params }: Props) {
  const { reportId } = await params;
  return <AdminReportDetailPage reportId={Number(reportId)} />;
}
