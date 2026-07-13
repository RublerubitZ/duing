import { redirect } from 'next/navigation';

export default async function LegacyFacilityDetailPage({
  params,
}: {
  params: Promise<{ facilityId: string }>;
}) {
  const { facilityId } = await params;
  redirect(`/facilities?facilityId=${encodeURIComponent(facilityId)}`);
}
