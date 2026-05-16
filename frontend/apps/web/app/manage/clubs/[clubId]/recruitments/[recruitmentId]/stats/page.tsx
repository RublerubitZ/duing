import { StatsClient } from './_components/StatsClient';

export default function StatsPage({
  params,
}: {
  params: Promise<{ clubId: string; recruitmentId: string }>;
}) {
  return <StatsClient params={params} />;
}