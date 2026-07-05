import { AdminInquiryDetailPage } from './_pages/AdminInquiryDetailPage';

type Props = {
  params: Promise<{ inquiryId: string }>;
};

export default async function Page({ params }: Props) {
  const { inquiryId } = await params;
  return <AdminInquiryDetailPage inquiryId={Number(inquiryId)} />;
}
