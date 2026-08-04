import { AdminRecruitmentsPage } from './_pages/AdminRecruitmentsPage';

// 검색어·필터를 전부 컴포넌트 상태로 두므로 useSearchParams 경계(Suspense)가 필요 없다.
export default function Page() {
  return <AdminRecruitmentsPage />;
}
