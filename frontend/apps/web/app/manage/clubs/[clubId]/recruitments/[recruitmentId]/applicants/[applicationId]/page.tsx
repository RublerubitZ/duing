import { ApplicantDetailPage } from './_components/ApplicantDetailPage';

type Params = {
  params: Promise<{ clubId: string; recruitmentId: string; applicationId: string }>;
};

export default async function Page({ params }: Params) {
  const { clubId, recruitmentId, applicationId } = await params;
  return (
    <ApplicantDetailPage
      clubId={Number(clubId)}
      recruitmentId={Number(recruitmentId)}
      applicationId={Number(applicationId)}
    />
  );
}
