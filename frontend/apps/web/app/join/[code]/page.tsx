'use client';

import { use } from 'react';

import { JoinCodeLanding } from './_components/JoinCodeLanding';

export default function JoinCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return <JoinCodeLanding code={code} />;
}
