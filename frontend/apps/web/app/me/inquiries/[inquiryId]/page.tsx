import { parseInquiryId } from '@/app/_lib/federationInquiryId';

import { InquiryDetailPage } from './_pages/InquiryDetailPage';

type Props = {
  params: Promise<{ inquiryId: string }>;
};

export default async function Page({ params }: Props) {
  const { inquiryId } = await params;
  return <InquiryDetailPage inquiryId={parseInquiryId(inquiryId)} />;
}
