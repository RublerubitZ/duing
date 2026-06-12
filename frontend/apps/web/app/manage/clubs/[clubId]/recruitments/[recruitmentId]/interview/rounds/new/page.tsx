import { RoundWizard } from './_components/RoundWizard';

type PageParams = {
  params: Promise<{ clubId: string; recruitmentId: string }>;
};

// Next.js 15 — params 가 Promise. Server Component 에서 await 후 Client Wizard 로 전달.
export default async function Page({ params }: PageParams) {
  const { clubId, recruitmentId } = await params;
  return (
    <RoundWizard
      clubId={Number(clubId)}
      recruitmentId={Number(recruitmentId)}
    />
  );
}
