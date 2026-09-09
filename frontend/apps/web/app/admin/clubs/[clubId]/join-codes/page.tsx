import { AdminClubJoinCodesPage } from './_pages/AdminClubJoinCodesPage';

type Props = {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ joinCodeId?: string }>;
};

export default async function Page({ params, searchParams }: Props) {
  const { clubId } = await params;
  const { joinCodeId } = await searchParams;
  // 손으로 고친 주소는 강조만 못 할 뿐이라 숫자가 아니면 조용히 무시한다.
  const highlightJoinCodeId = joinCodeId !== undefined && /^\d+$/.test(joinCodeId)
    ? Number(joinCodeId)
    : null;
  return <AdminClubJoinCodesPage clubId={Number(clubId)} highlightJoinCodeId={highlightJoinCodeId} />;
}
