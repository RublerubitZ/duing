# 관리자 강제 로그아웃 (Admin Force Logout) — 설계

## 목표
관리자가 특정 사용자의 모든 로그인 세션을 즉시 무효화한다. 토큰 탈취·기기 분실·내부자 의심 시
운영진이 해당 사용자의 세션을 끊을 수단(인시던트 대응)이 없던 공백을 메운다.

기존 `tokenVersion` 무효화 메커니즘(JWT claim vs DB `user.tokenVersion` 비교, 불일치 시 매 요청 401)을
그대로 재사용한다 — 새 세션 저장소/블랙리스트/캐시/이벤트 도입 없음.

## API
- `POST /api/v1/admin/users/{userId}/force-logout` → **204 No Content**
- ADMIN 전용. 기존 `AdminUserController`(클래스 레벨 `@PreAuthorize("hasRole('ADMIN')")`)에 추가.
- 별도 Security Matcher 추가 금지 — `.anyRequest().authenticated()` + 메서드 보안 그대로.
- Request Body 없음.

## 동작
1. `userRepository.findByIdForUpdate(targetUserId)` — 행 잠금(PESSIMISTIC_WRITE, logout/withdraw 동일)
2. 없으면 `UserException.UserNotFoundException`(404)
3. `user.bumpTokenVersion()` → 트랜잭션 커밋
4. 이후 그 사용자의 기존 Access Token은 매 요청 필터의 `tokenVersion` 비교에서 불일치 → 401

## Service
- 신규 command: `ForceLogoutCommand(Long targetUserId, Long actorUserId)`
- `UserService.forceLogout(ForceLogoutCommand command)` / `GeneralUserService` 구현, `@Transactional`
- 최소 운영 로그: `log.info("Admin force logout. actorId={}, targetUserId={}", actorUserId, targetUserId)`
  (감사 테이블은 별도 P1 항목 — 본 범위 아님)

## Controller
- 현재 관리자 식별: `@AuthenticationPrincipal UserPrincipal currentUser`
- `userService.forceLogout(new ForceLogoutCommand(userId, currentUser.id()))` → `ResponseEntity.noContent().build()`

## 정책
- **자기 자신 대상 허용** — 관리자가 자기 세션을 무효화하는 것은 정상 보안 시나리오. 추가 validation 없음.
- 멱등: `bumpTokenVersion` 반복 호출도 결과적으로 기존 토큰 무효(안전).

## 테스트 (RestAssured 통합, AdminUsersSearchControllerTest 미러)
- ADMIN 호출 → 204, 그리고 대상의 기존 토큰으로 보호 엔드포인트(`POST /auth/logout`) 호출 시 401
- STUDENT 호출 → 403
- 존재하지 않는 userId → 404
- ADMIN 이 자기 자신 대상 → 204 (그리고 자기 토큰도 무효화됨)

## Out of Scope (의도적 제외)
Refresh Token 무효화 / 감사(Audit) 테이블 / 강제 로그아웃 사유(reason) / 활성 세션 조회 ·
세션 목록 관리 / Redis 토큰 블랙리스트 / 이벤트 발행
