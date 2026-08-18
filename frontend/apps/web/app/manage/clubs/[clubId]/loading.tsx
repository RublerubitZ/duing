// 콘솔 내부 이동(멤버→회비 등)에서 사이드바(ManageShell)까지 스피너로 교체되지 않도록,
// 상위 /manage 경계와 별개로 [clubId] 세그먼트에도 경계를 둔다 — 바뀐 세그먼트에 가장 가까운
// 경계가 쓰이므로 셸은 유지되고 본문만 교체된다.
import { RouteLoading } from '@/app/_components/RouteLoading';

export default function Loading() {
  return <RouteLoading />;
}
