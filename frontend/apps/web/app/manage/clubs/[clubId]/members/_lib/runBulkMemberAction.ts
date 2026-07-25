// 회원 일괄 작업 오케스트레이션. 벌크 API 가 없어 기존 단건 API 를 "순차" 반복 호출한다
// (동시 폭주 방지). 한 건이 실패해도 멈추지 않고 계속 돌며 실패를 수집해 요약으로 돌려준다.
// 훅이 아닌 순수 함수 — mutateAsync 같은 실제 액션은 호출부에서 주입한다.

export type BulkMemberFailure = { id: number; message: string };

export type BulkMemberResult = {
  succeeded: number;
  failed: BulkMemberFailure[];
};

export async function runBulkMemberAction(
  memberIds: readonly number[],
  action: (id: number) => Promise<void>,
): Promise<BulkMemberResult> {
  const failed: BulkMemberFailure[] = [];
  let succeeded = 0;
  for (const id of memberIds) {
    try {
      await action(id);
      succeeded += 1;
    } catch (error) {
      failed.push({ id, message: error instanceof Error ? error.message : '처리 실패' });
    }
  }
  return { succeeded, failed };
}
