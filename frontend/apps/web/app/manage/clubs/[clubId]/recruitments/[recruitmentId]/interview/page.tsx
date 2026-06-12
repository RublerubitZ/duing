import { InterviewRoundsLanding } from './_pages/InterviewRoundsLanding';
// TODO(FE#3/4): 구 InterviewManagementPage·관련 _components/_utils 철거 예정

type PageParams = {
  params: Promise<{ clubId: string; recruitmentId: string }>;
};

// Next.js 15 — params 가 Promise. Server Component 에서 await 후 Client Page 로 전달.
export default async function Page({ params }: PageParams) {
  const { clubId, recruitmentId } = await params;
  return (
    <InterviewRoundsLanding
      clubId={Number(clubId)}
      recruitmentId={Number(recruitmentId)}
    />
  );
}
