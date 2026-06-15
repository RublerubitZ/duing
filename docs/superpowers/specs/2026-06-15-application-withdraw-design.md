# 지원 철회(Application Withdraw) 설계

- 날짜: 2026-06-15
- 범위: 학생이 본인의 **SUBMITTED 상태** 지원을 철회한다 (백엔드 API + 프론트 버튼).

## 목표

학생이 잘못 제출했거나 마음이 바뀐 지원을, 동아리가 검토를 시작하기 전(`SUBMITTED`)에 스스로 철회할 수 있게 한다. 오제출·중복 지원의 부담을 줄여 지원 경험을 개선한다.

## 결정 사항

- **철회 가능 범위: `SUBMITTED` 상태만.** 운영진이 검토를 시작한(`UNDER_REVIEW` 이상) 지원은 학생이 임의로 뺄 수 없다.
- **메커니즘: 소프트 삭제.** `Application`은 이미 `@SQLDelete` + `@SQLRestriction` 이고, 유니크 인덱스 V6 가 부분 인덱스(`(recruitment_id, user_id) WHERE deleted_at IS NULL`)다. 따라서 철회=소프트 삭제로 처리하면 슬롯이 비워져 **같은 공고에 재지원이 가능**하고, 마이그레이션·신규 상태값이 필요 없다.
- **재지원:** 철회 후 모집이 아직 열려 있으면 다시 지원할 수 있다(기존 submit 경로 그대로).

## 백엔드

- **엔드포인트:** `DELETE /api/v1/users/me/applications/{applicationId}` → `204 No Content` (기존 학생 지원 경로와 동일 prefix). (`ApplicationApi` 인터페이스에 정의, `ApplicationController` 구현)
- **서비스:** `ApplicationService.withdraw(Long applicationId, Long currentUserId)`
  1. `findById` → 없으면 `ApplicationNotFoundException`(404).
  2. 소유자 검증 → 본인 아니면 `ForbiddenApplicationAccessException`(403). (기존 `getMyApplicationDetail` 패턴 재사용)
  3. 상태가 `SUBMITTED` 아니면 신규 `CannotWithdrawApplicationException`(409).
  4. `applicationRepository.delete(application)` → `@SQLDelete` 소프트 삭제(`@Version` WHERE 포함).
- **동시성:** 운영진이 동시에 `UNDER_REVIEW` 로 전이하면, (a) 3번 상태 검증에서 걸리거나 (b) 소프트 삭제 시 `@Version` 불일치로 `ObjectOptimisticLockingFailureException` → 기존 `ConcurrentStatusUpdateException`(409) 매핑 흐름으로 안내.
- **신규 예외:** `ApplicationDomainException.CannotWithdrawApplicationException` (409, "제출 직후에만 철회할 수 있어요. 검토가 시작된 지원은 철회할 수 없습니다.").

## 프론트엔드

- `packages/api` `client.applications.withdraw(applicationId): Promise<void>` (DELETE).
- `packages/hooks` `useWithdrawApplicationMutation()` — 성공 시 `myApplications` 쿼리 무효화(낙관적 제거 후 invalidate).
- `/me/applications`의 `ApplyRow` 와 상세 모달(`ApplyDetailModal`)에서 **상태가 `SUBMITTED` 일 때만** "지원 철회" 버튼 노출.
- 클릭 → 확인 다이얼로그("이 지원을 철회할까요? 되돌릴 수 없어요.") → 확인 시 mutation → 목록에서 제거. 실패 시 토스트로 사유 안내.

## 테스트

- 백엔드(서비스): SUBMITTED 철회 성공 + 같은 공고 재지원 성공 / 비-SUBMITTED(UNDER_REVIEW 등) 철회 시 409 / 타인 지원 철회 시 403 / 없는 지원 404.
- 프론트: SUBMITTED 카드에만 철회 버튼 노출 / 확인 시 mutation 호출 + 목록 제거 / 비-SUBMITTED 카드엔 버튼 없음.

## Out of Scope

- `WITHDRAWN` 상태값 도입(목록에 "철회됨"으로 잔존) — 부분 유니크 인덱스 재설계가 필요해 제외.
- ACCEPTED 이후의 "동아리 탈퇴" — 멤버십 도메인의 별개 기능.
- `UNDER_REVIEW`/`INTERVIEW_PENDING` 단계 철회.
- 철회에 대한 운영진 알림·철회 이력/통계 집계.
- 철회 사유 입력.
