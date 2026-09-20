import type { Metadata } from 'next';
import { MyPage } from './_pages/MyPage';

export const metadata: Metadata = { title: '마이페이지 | 두잉' };

export default function Page() {
  return <MyPage />;
}
