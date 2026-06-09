import { InterviewManagementPage } from './_pages/InterviewManagementPage';

type PageParams = {
  params: Promise<{ clubId: string; recruitmentId: string }>;
};

// Next.js 15 — params 가 Promise. Server Component 에서 await 후 Client Page 로 전달.
export default async function Page({ params }: PageParams) {
  const { clubId, recruitmentId } = await params;
  return (
    <InterviewManagementPage
      clubId={Number(clubId)}
      recruitmentId={Number(recruitmentId)}
    />
  );
}
