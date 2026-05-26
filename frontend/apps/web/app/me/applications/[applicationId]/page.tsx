import { ApplicationsPage } from '../_pages/ApplicationsPage';

type PageProps = {
  params: Promise<{ applicationId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { applicationId } = await params;
  return <ApplicationsPage defaultOpenId={applicationId} />;
}
