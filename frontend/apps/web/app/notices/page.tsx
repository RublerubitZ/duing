import type { Metadata } from 'next';
import { NoticePage } from './_pages/NoticePage';

export const metadata: Metadata = { title: '소식 | 두잉' };

export default function Page() {
  return <NoticePage />;
}
