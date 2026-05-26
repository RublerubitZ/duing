import { ApplicationsPage } from '../_pages/ApplicationsPage';

export default async function Page({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  return <ApplicationsPage defaultOpenId={applicationId} />;
}
