# 총동연 콘솔 — 회원 관리 운영 기능 (상세·계정 정지·관리자 메모·감사 로그)

- 날짜: 2026-07-26
- 대상: 총동연(ADMIN) 콘솔의 회원 관리 화면 `/admin/users`
- 분리: PR-1(BE 인프라) → PR-2(BE 기능 API) → PR-3(FE 기능) → PR-4(FE 리디자인·KPI, 후속)

---

## 배경 / 현재 상태

`/admin/users`는 지금 **검색 + 강제 로그아웃**만 가능한 조회 화면이다. 회원 한 명에 대해 운영자가 판단할 근거(가입 정보, 소속 동아리, 과거 조치 이력)가 없고, 문제 계정을 막을 수단도 없다.

### 현재 코드

- 화면: `frontend/apps/web/app/admin/users/_pages/AdminUsersPage.tsx` (108줄) — 검색 입력 + `AdminUsersTable` + `AdminForceLogoutDialog`
- API: `AdminUserController` — `GET /admin/users?q=`(검색), `POST /admin/users/{userId}/force-logout`
- 강제 로그아웃: `GeneralUserService.forceLogout` — 행잠금 → `bumpTokenVersion()` → `authSessionService.revokeAll(ADMIN_FORCE)`. 감사는 `log.info` 한 줄뿐(DB 기록 없음)

### 코드 실사에서 확인된 제약

1. **이메일은 이 플랫폼에 없다.** `V81__drop_users_email_and_email_verifications.sql`에서 컬럼·테이블 모두 드롭됐다. 로그인은 학번+비밀번호, 본인확인은 MO 휴대폰 인증(`users.phone_verified_at`)이다. → 원 요구사항의 "학교 이메일", "이메일 인증 여부"는 **휴대폰 번호 / 휴대폰 인증 여부**로 대체한다.
2. **프로필 이미지도 없다.** `User`에 이미지 필드가 없다. → 이름 첫 글자 이니셜 Avatar를 쓴다.
3. **권한은 2단계뿐이다.** `UserRole { STUDENT, ADMIN }` — SUPER_ADMIN은 존재하지 않는다.
4. **범용 감사 테이블이 없다.** `auth_event`가 있으나 (a) 90일 후 물리 삭제(`AuthSessionCleanupJob`), (b) 작업자(actor) 컬럼 없음, (c) 메모 수정은 인증 이벤트가 아니다. → 재사용하지 않는다.
5. **"마지막 로그인"을 담는 durable한 소스가 없다.** `auth_event`(LOGIN)는 90일 보존, `auth_session.last_used_at`은 rotation마다 갱신되어 실제로는 "마지막 토큰 갱신 시각"이다.
6. **회원 검색은 검색어가 필수다.** `GeneralUserService.searchForAdmin`이 빈 `q`에 `InvalidSearchQueryException`(400)을 던진다. 정지시킨 회원을 다시 찾을 경로가 없다.
7. **검색 JPQL에 `ORDER BY`가 없다.** `UserRepository.searchForAdmin` — 지금은 검색 결과가 적어 드러나지 않지만, `q`를 optional로 열면 페이지 간 행 중복·누락이 발생한다.
8. **회장 번호 조회는 재사용 불가.** `GET /clubs/{clubId}/members/{memberId}/phone`은 첫 줄이 `clubAuthService.requireLeader(requesterId, clubId)`이고 `clubId`+`memberId`(ClubMember PK) 스코프다. ADMIN 회원 관리 화면에는 둘 다 없고 대상이 무소속이면 경로 자체가 없다. → **엔드포인트는 새로 만들되 정책은 그대로 따른다**(마스킹·no-store·PHONE_VIEW 로그·`useMutation`).

---

## 목표

회원 관리 화면을 조회 전용에서 **플랫폼 운영 화면**으로 바꾼다. 운영자가 한 회원에 대해 판단하고(상세), 조치하고(정지/해제/강제 로그아웃), 맥락을 남기고(메모), 그 조치가 추적 가능(감사 로그)하게 한다.

회원 정보 **직접 수정은 하지 않는다**. 조회 중심 + 운영 조치만 제공한다.

---

## PR-1 (백엔드) — 스키마 · 상태 차단 · 목록 필터

### V94 마이그레이션

```sql
-- 계정 상태: ACTIVE(정상) / SUSPENDED(이용 정지). 정지는 로그인·API 접근 차단이며 탈퇴(soft delete)와 별개다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

-- 마지막 로그인. 기존 회원은 백필하지 않는다(90일치 auth_event 외에 소스가 없음) — NULL = "기록 없음".
-- 타입은 naive TIMESTAMP 유지 — users 의 다른 시각 컬럼(terms_agreed_at·locked_until·phone_verified_at)과
-- 같은 규약이어야 하고, users 테이블 전체가 TIMEZONE.md 2단계에서 함께 timestamptz 로 전환된다 (결정 D-13).
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

-- 관리자 내부 메모. 사용자에게 절대 노출되지 않는다(ADMIN 전용 응답에만 포함).
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- 관리자 조치 감사 로그. append-only, 보존기간 없음(auth_event 와 달리 cleanup 잡 대상이 아니다).
-- 개인정보(번호·이름)와 메모 본문은 저장하지 않는다 — 사실 관계만 남기고 값은 users 조인으로 해석한다.
-- updated_at·deleted_at 을 두지 않는다: 수정·삭제가 없는 테이블에 그 컬럼이 있으면 거짓 신호가 된다
-- (phone_verification_events 전례). created_at 만 TIMESTAMPTZ — 신규 테이블이라 2단계 전환 대상이 아니다.
CREATE TABLE admin_user_action_log (
    id             BIGSERIAL PRIMARY KEY,
    actor_user_id  BIGINT      NOT NULL REFERENCES users (id),
    target_user_id BIGINT      NOT NULL REFERENCES users (id),
    action         VARCHAR(40) NOT NULL,
    reason         VARCHAR(500),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_admin_user_action_log_target ON admin_user_action_log (target_user_id, id DESC);
```

`status`에 `DEFAULT 'ACTIVE'`를 두는 이유: 롤백 안전성. 이 컬럼을 모르는 이전 버전 애플리케이션이 붙어도 INSERT가 깨지지 않는다(V90 `restore_rollback_safe_defaults` 전례).

`action`에 CHECK 제약을 걸지 않는다. 이 레포의 모든 enum 컬럼(`auth_event.event_type`, `auth_session.platform`, `revoke_reason`)이 제약 없이 `@Enumerated(EnumType.STRING)`으로만 보장한다. PostgreSQL은 CHECK 수정이 DROP+ADD라 액션이 늘 때마다 마이그레이션이 붙는데(PR-4에서 추가 예상), 막아주는 건 앱이 잘못된 문자열을 넣는 경우뿐이고 그건 `@Enumerated`가 구조적으로 막는다 (결정 D-14).

**`TIMEZONE.md`에 이 테이블을 등록한다** — `created_at`이 이미 `timestamptz`이고 `Instant`로 저장·응답되므로 2단계 백필 대상에서 제외해야 한다.

### 엔티티

- `UserStatus { ACTIVE, SUSPENDED }` (`domain/user/entity`)
- `User`에 필드 추가: `status`(`@Enumerated(STRING)`, NOT NULL), `lastLoginAt`, `adminNote`
- `User` 메서드 추가:
  - `boolean isActive()` — `status == ACTIVE`
  - `void suspend()` / `void unsuspend()` — 상태 전환만. 세션 폐기는 서비스가 조율한다
  - `void changeAdminNote(String note)` — 빈 문자열은 그대로 저장(= 메모 비우기)
  - `recordSuccessfulLogin(LocalDateTime now)` — 기존 시그니처에 `now`를 받아 `lastLoginAt`을 함께 갱신
- `AdminUserActionLog` (`domain/user/entity`) — **`BaseEntity`를 상속하지 않는다.** `@Id` + `@GeneratedValue` + `@CreatedDate private Instant createdAt` + `@EntityListeners(AuditingEntityListener.class)`를 직접 선언한다(`PhoneVerificationEvent` 전례). append-only이므로 수정 메서드를 두지 않는다
- `AdminUserAction { ACCOUNT_SUSPENDED, ACCOUNT_UNSUSPENDED, FORCE_LOGOUT, ADMIN_NOTE_UPDATED, PHONE_VIEW }`

`createdAt`을 `Instant`로 두면 `TIMEZONE.md`의 절대 규칙("신규 API는 Event Time을 `Instant`로 응답한다")을 **변환 없이** 만족한다 — 이 필드만은 `TimeMapper`를 거치지 않는다.

`PHONE_VIEW`는 기존 회장 번호 조회의 서버 로그(`action=PHONE_VIEW`)와 같은 이름이다. 두 경로를 하나의 키워드로 검색할 수 있게 용어를 통일한다 (결정 D-12).

**작업자 이름은 스냅샷하지 않는다.** `actor_user_id`만 저장하고 표시할 때 `users` 조인으로 해석한다. 이름도 개인정보이므로 감사 테이블에 복제하지 않는다는 원칙과 일치한다. 관리자 계정이 탈퇴하면 `@SQLRestriction`으로 조인에서 빠져 **이름이 null로 내려가고 화면은 "알 수 없음"으로 표시**한다 — 조치가 있었다는 사실 자체는 그대로 남는다(의도됨).

### 정지 계정 차단

두 지점에서 막는다.

1. **로그인** — `GeneralUserService.login`, **비밀번호 검증을 통과한 직후**에 확인한다.
   ```java
   if (!passwordEncoder.matches(...)) { ...기존 실패 처리... }
   if (!user.isActive()) {
       throw new UserException.AccountSuspendedException();
   }
   user.recordSuccessfulLogin(now);
   ```
   비밀번호 검증 **뒤**에 두는 것이 중요하다. 앞에 두면 학번만 아는 제3자에게 "이 계정은 정지 상태"라는 정보가 새어나간다(계정 열거 + 상태 노출).

2. **`JwtAuthenticationFilter`** — 이미 User를 로드하므로 `token_version` 비교 옆에 한 조건을 더한다.
   ```java
   .filter(user -> user.getTokenVersion() == claims.tokenVersion() && user.isActive())
   ```
   refresh rotation 경로는 정지 시 `revokeAll`이 세션을 죽여 `session.isUsable`에서 이미 막히므로 별도 처리하지 않는다.

`AccountSuspendedException` — `HttpStatus.FORBIDDEN` + code `ACCOUNT_SUSPENDED`(`PasswordResetNotAllowedException` 전례). 메시지: `정지된 계정입니다. 총동아리연합회로 문의해 주세요.`

> **⚠️ 백엔드가 문구를 내려주는 것만으로는 화면에 뜨지 않는다.** 로그인 화면(`LoginFormPanel`)의 실패 처리는 원래 "알려진 몇 가지만 서버 문구를 쓰고 나머지는 전부 자격증명 실패로 단정"하는 구조였다. 그래서 403 이 자격증명 문구로 덮여 정지된 사용자가 맞는 비밀번호를 계속 의심했다. 429(계정 잠금)도 같은 이유로 잠금 안내를 잃고 있었다.
>
> 기본값을 뒤집어 고쳤다 — **서버 문구를 쓸 수 없는 경우만 좁게 나열하고 나머지는 서버가 준 사유를 그대로 보여준다.** 못 쓰는 경우는 셋이다: `ApiError` 가 아닐 때(문구 없음), 5xx(사용자 대면 문구가 아님), 400(필드명이 섞인 검증 문구). 401 은 서버 문구와 같지만 화면이 소유해 표현을 고정한다.
>
> 이 자리는 타임아웃 오안내로 이미 한 번 같은 뿌리에서 터졌던 곳이다. **백엔드에 새 로그인 실패 사유를 추가할 때 프론트를 함께 손대야 하는 구조를 남기지 않는 것**이 이 뒤집기의 목적이다.

#### 비밀번호 변경·재설정 정책

- **비밀번호 변경**(`changePassword`)은 로그인 상태 전용이다. 정지되면 `JwtAuthenticationFilter`가 401을 내므로 **자동으로 막힌다** — 별도 처리를 넣지 않는다.
- **비밀번호 재설정**(MO 인증 기반 비로그인 경로)은 **차단하지 않는다.** 여기서 정지를 검사하면 인증 전 단계에서 계정 상태가 노출되어 D-11과 정면으로 모순된다 — 학번과 번호를 아는 제3자가 재설정 시도만으로 정지 여부를 알아내게 된다. 재설정에 성공해도 로그인 단계에서 전용 메시지로 안내되므로 사용자는 상황을 알게 되고, SMS 남용은 기존 rate limit(번호+IP 5/hr)이 이미 막는다. 재설정 성공 시 도는 `bumpTokenVersion` + `revokeAll`도 정지 계정엔 이미 세션이 없어 무해하다 (결정 D-15).

### 목록 조회 개선

`GET /api/v1/admin/users`

| 파라미터 | 변경 |
|---|---|
| `q` | **필수 → 선택**. 비어 있으면 전체 대상 |
| `status` | **신규**. `ACTIVE` / `SUSPENDED`. **생략 = 전체(ALL)** — `ALL` 이라는 값을 따로 두지 않는다 |

- `InvalidSearchQueryException`(빈 q 400)을 제거한다.
- JPQL에 조건과 정렬을 넣는다. 기본 정렬 **`createdAt DESC, id DESC`** — `id`를 tie-breaker로 둬야 같은 초에 가입한 행들의 페이지 경계가 안정적이다. 정렬 화이트리스트(`studentId`/`name`/`createdAt`)는 유지하고, 명시적 sort가 오면 그 뒤에 `id DESC`를 덧붙인다.
- 응답 `AdminUserSearchResponse`에 `status` 추가. **휴대폰은 목록에 넣지 않는다**(개인정보 노출 표면 최소화 — 결정 D-7).

### PR-1 테스트

- 정지 계정 로그인 → 403 + `ACCOUNT_SUSPENDED`
- 정지 계정의 기존 액세스 토큰으로 보호 API 호출 → 401
- 해제 후 로그인 → 200
- 로그인 성공 시 `last_login_at` 갱신
- 빈 `q` + `status=SUSPENDED` → 정지 회원만, `q` 없이 전체 조회 시 `createdAt DESC, id DESC` 정렬
- 정렬 화이트리스트 밖 필드 요청 → 400 (기존 동작 유지)

---

## PR-2 (백엔드) — 상세 · 상태 변경 · 메모 · 번호 조회

모든 엔드포인트는 `AdminUserController`(클래스 레벨 `@PreAuthorize("hasRole('ADMIN')")`)에 추가한다. `api/AdminUserApi.java`에 Swagger 인터페이스를 먼저 정의한다.

### `GET /api/v1/admin/users/{userId}` — 회원 상세

```jsonc
{
  "id": 12,
  "name": "정우진",
  "studentId": "2023118902",
  "grade": "SOPHOMORE",
  "college": "IT_ENGINEERING",
  "major": "전자공학과",
  "role": "STUDENT",
  "maskedPhone": "010-****-9983",     // PhoneMasker.mask() — 원본은 별도 엔드포인트
  "phoneVerified": true,               // phoneVerifiedAt != null
  "phoneVerifiedAt": "2024-03-04T...",
  "status": "SUSPENDED",
  "createdAt": "2024-03-04T...",       // 가입일
  "lastLoginAt": null,                 // null = "기록 없음"
  "adminNote": "커뮤니티 신고 3건 누적으로 정지.",
  "adminNoteUpdatedAt": "2026-07-24T14:02:00",  // 최신 ADMIN_NOTE_UPDATED 로그에서 파생
  "adminNoteUpdatedBy": "김운영",                // 〃 (actor 이름). 기록 없으면 둘 다 null
  "clubs": [
    { "clubId": 3, "clubName": "두잉코드", "role": "LEADER", "joinedAt": "2023-03-02T..." }
  ],
  "recentActions": [
    { "action": "ACCOUNT_SUSPENDED", "actorName": "김운영", "reason": "신고 누적", "at": "2026-07-25T..." }
  ]
}
```

- **soft-deleted(탈퇴) 회원은 404** — `@SQLRestriction`으로 조회되지 않는다.
- `clubs` — `ClubMemberRepository`에 사용자 스코프 프로젝션 쿼리를 추가한다(기존 `findClubIdsByUserId`는 id만 반환). 폐쇄된 동아리는 `@SQLRestriction`으로 자동 제외. 가입 동아리 수는 배열 길이로 충분하므로 별도 필드를 두지 않는다.
- `recentActions` — **`PHONE_VIEW`는 제외**하고 `WHERE target_user_id = ? AND action <> 'PHONE_VIEW' ORDER BY id DESC LIMIT 20`. 개인정보 열람은 감사 대상이지 운영 조치가 아니며, 섞으면 정지·해제 같은 실제 조치가 열람 기록에 묻힌다(결정 D-5). append-only라 `id`가 단조 증가하므로 `created_at`이 아니라 `id`로 정렬한다. 페이지네이션은 두지 않는다.
- `adminNoteUpdatedAt/By` — 최신 `ADMIN_NOTE_UPDATED` 1행에서 파생한다. **`users`에 컬럼을 추가하지 않는다** — 같은 사실을 두 곳에 저장하면 한쪽만 갱신되는 순간 어긋난다(결정 D-9).
- `recentActions`와 `adminNoteUpdatedBy`가 모두 작업자 이름을 필요로 하므로 actor 이름 해석 경로는 하나로 공유한다.

### `PATCH /api/v1/admin/users/{userId}/status` — 계정 상태 변경

요청: `{ "status": "SUSPENDED", "reason": "커뮤니티 신고 3건 누적" }`
응답: **204 No Content**

- `reason` — `@NotBlank`, `@Size(max = 200)`. **정지·해제 모두 필수.** "왜 풀었는지"가 나중에 더 문제가 된다. `@NotBlank`는 ASCII 공백만 거르므로 전각 공백(U+3000)까지 막는 유니코드 인식 검증을 함께 건다.

> **운영 원칙 — `reason`에 불필요한 개인정보를 쓰지 않는다.**
> `admin_user_action_log`는 보존기간이 없는 영구 테이블이고(결정 D-17), 탈퇴 회원 개인정보 파기 잡의 대상도 아니다. `users.admin_note`가 익명화 대상인 것과 대조적이다. 따라서 `reason`에는 **판단 근거만** 적고 회원의 이름·연락처·학번·제3자 정보는 쓰지 않는다. 대상 회원은 `target_user_id`로 이미 식별되므로 사유에 다시 적을 이유가 없다.
> - 좋은 예: `커뮤니티 신고 3건 누적`, `본인 소명 수용`, `중복 계정 확인`
> - 나쁜 예: `010-1234-5678 로 확인함`, `김OO 학생이 신고`, `2021118033 과 동일인`
>
> 이 원칙은 화면 안내 문구로도 노출하지 않고 운영 가이드로만 둔다 — 입력 폼에 "개인정보를 쓰지 마세요"를 띄우면 오히려 무엇을 쓸 수 있는지 혼란스러워진다.
- **동일 상태면 무동작**: 행잠금 후 현재 상태와 같으면 아무것도 하지 않고 204. 버튼 연타가 감사 이력을 오염시키는 것을 막는다.
- **정지 집행** (`forceLogout`과 동일한 순서):
  ```java
  User target = userRepository.findByIdForUpdate(userId)   // token_version lost update 방지
          .orElseThrow(UserException.UserNotFoundException::new);
  // ...보호 정책 검증, 동일 상태 조기 반환...
  target.suspend();
  target.bumpTokenVersion();
  authSessionService.revokeAll(target.getId(), SessionRevokeReason.ADMIN_FORCE);
  actionLogRepository.save(AdminUserActionLog.of(actorId, userId, ACCOUNT_SUSPENDED, reason));
  ```
- **해제**는 상태 전환 + 로그만. 토큰 버전을 되돌리지 않는다(되돌릴 수 없고, 재로그인하면 그만이다).

#### 관리자 보호 정책

| 규칙 | 응답 |
|---|---|
| 자기 자신 정지 금지 | 400 `SELF_SUSPEND_NOT_ALLOWED` |
| 다른 ADMIN 계정 정지 금지 | 400 `ADMIN_SUSPEND_NOT_ALLOWED` |

`UserRole`이 2단계뿐이라 "마지막 SUPER_ADMIN 보호"는 적용 대상이 없다. ADMIN 계정 자체를 아무도 정지시킬 수 없으므로 전원 잠금 위험이 구조적으로 존재하지 않는다.

**강제 로그아웃에는 이 제약을 걸지 않는다.** 계정이 잠기지 않고 재로그인하면 복구되므로 자기 자신·다른 ADMIN 모두 허용한다(현행 동작 유지).

### `PUT /api/v1/admin/users/{userId}/admin-note` — 관리자 메모 저장

요청: `{ "note": "..." }` — `@Size(max = 1000)`, `null` 불가(비우려면 빈 문자열)
응답: **204 No Content**

- 사용자 대면 응답(`UserResponse` 등)에 `adminNote`가 절대 포함되지 않아야 한다. 회귀 테스트로 고정한다.
- **빈 문자열 저장(메모 삭제)도 `ADMIN_NOTE_UPDATED`로 기록한다.** "누가 메모를 지웠는지"가 오히려 더 중요한 이력이다.
- 감사 로그에 **메모 본문을 넣지 않는다**(`reason`은 null). 넣으면 내부 메모가 감사 테이블에 복제돼 보존·삭제 정책이 둘로 갈린다.
- **값 비교에서 `null`과 빈 문자열은 같은 값으로 본다.** 둘 다 "메모 없음"이고, 구분하면 메모 칸을 열었다가 그냥 저장하는 것만으로 최종 수정자가 바뀐다. 반대로 **내용이 있던 메모를 빈 문자열로 지우는 것은 실제 변화이므로 그대로 기록된다** — 위의 "메모 삭제도 감사 대상"은 지울 메모가 있을 때의 규정이고, 그 근거("누가 지웠는지")도 그때만 성립한다.
- **내용이 현재 값과 같으면 무동작 204다** (결정 D-16). `users.admin_note`를 갱신하지 않고, `ADMIN_NOTE_UPDATED` 감사 로그도 남기지 않으며, 따라서 `adminNoteUpdatedAt`·`adminNoteUpdatedBy`도 그대로 유지된다. 두 가지 이유가 있다 — (a) 아무것도 고치지 않은 사람이 "최종 수정자"로 찍히는 것은 부정확하고, (b) 상세 패널의 조치 이력은 최신 20건만 보여주는데 메모 저장은 정지·해제보다 훨씬 잦아서, 저장 20번이면 정지 이력이 화면에서 밀려난다. `PATCH .../status`의 동일 상태 무동작(D-6)과 같은 원칙이다.
- **행잠금이 필요하다.** `User`에는 `@Version`도 `@DynamicUpdate`도 없어 Hibernate가 더티 플러시에서 **모든 컬럼**을 쓴다. 잠금 없이 읽으면 메모 저장이 그 사이 커밋된 계정 정지(`status`·`token_version`)를 옛 스냅샷 값으로 되돌리고, 감사 로그에는 정지 기록만 남아 **이력이 거짓이 된다.** 비관적 잠금은 모든 쓰기 경로가 잡아야 성립한다.

### `GET /api/v1/admin/users/{userId}/phone` — 원본 번호 조회

응답: `{ "phone": "010-2210-9983" }` + `Cache-Control: no-store`

기존 회장 번호 조회(`ClubMemberController.getMemberPhone`)와 **동일한 개인정보 조회 정책**을 따른다. `Pragma`/`Expires`는 추가하지 않는다 — `Pragma`는 RFC 7234에서 요청 헤더로만 정의돼 응답에서 의미가 없고, `Expires`는 `Cache-Control`이 있으면 무시된다. 기존 엔드포인트와 다르게 만들 실익 없이 "왜 여기만 다른가"라는 유지보수 비용만 생긴다(결정 D-10).

**⚠️ 이 메서드는 조회가 아니라 쓰기다.** 감사 로그를 INSERT하므로 클래스 레벨 `@Transactional(readOnly = true)`에 걸리면 H2에서는 통과하고 실제 Postgres에서 500이 난다(이 레포에 전례가 있다). 반드시 쓰기 트랜잭션으로 명시 분리하고, TestContainers(Postgres) 통합 테스트로 콜드 경로를 검증한다.

**감사 기록과 번호 반환은 같은 트랜잭션에 묶는다.** 기록이 실패했는데 번호가 나가면 "감사 없는 개인정보 열람"이 된다.

기존 서버 로그 형식(`log.info("... action=PHONE_VIEW")`)도 함께 유지한다 — 번호 값은 절대 로그에 남기지 않는다.

### `POST /api/v1/admin/users/{userId}/force-logout` — 기존, 감사 로그만 추가

동작 변경 없음. `AdminUserActionLog(FORCE_LOGOUT, reason=null)` 기록을 추가한다.

### PR-2 테스트

- 상세 조회: 가입 동아리·역할·가입일 반영, 탈퇴 회원 404, `recentActions`에 `PHONE_VIEW` 미포함, `adminNoteUpdatedAt/By`가 최신 메모 로그에서 파생
- 상태 변경: 정지 시 세션 전부 폐기 + `token_version` 증가 + 로그 1건, 동일 상태 재요청 시 로그 미생성, 사유 누락 400, 자기 자신·ADMIN 대상 400
- 메모: 1000자 초과 400, 빈 문자열 저장 시 로그 기록, 사용자 대면 응답에 `adminNote` 미포함
- 번호 조회: **실제 Postgres에서 200 + 로그 1건**(readOnly 함정 회귀), `Cache-Control: no-store` 헤더
- 강제 로그아웃: 로그 1건 추가 기록(기존 동작 회귀 없음)

---

## PR-3 (프론트) — 기능 구현

**기존 레포 스타일을 그대로 쓴다.** 목업의 비주얼 적용은 PR-4다(결정 D-8).

### 패키지 레이어

1. `packages/types` — `AdminUserDetail`, `AdminUserClub`, `AdminUserActionLogEntry`, `UserStatus`, `AdminUserSearchParams`에 `status` 추가 (백엔드 enum `AdminUserAction`과 이름이 겹치지 않게 로그 항목 타입은 `...LogEntry`로 둔다)
2. `packages/api/src/client.ts` — `admin.users.detail / updateStatus / saveNote / phone`
3. `packages/hooks/src/admin.ts` — `useAdminUserDetailQuery`, `useAdminUserStatusMutation`, `useAdminUserNoteMutation`, `useAdminUserPhoneMutation`

#### 검색 훅의 `enabled` 게이트

`useAdminUserSearchQuery`에 `enabled: trimmedQuery.length > 0`가 걸려 있다(`packages/hooks/src/admin.ts:77`). 검색어 없이 목록을 보려면 풀어야 하는데, **같은 훅을 동아리장 검색 콤보박스(`LeaderSearchCombobox`)도 쓴다** — 그냥 풀면 콤보박스가 열리자마자 전체 회원을 드롭다운에 쏟아붓는다.

→ 훅에 명시적 opt-in을 추가한다.
```ts
useAdminUserSearchQuery(params, options?: { allowEmptyQuery?: boolean })
// enabled: options?.allowEmptyQuery === true || trimmedQuery.length > 0
```
회원 관리 페이지만 `allowEmptyQuery: true`를 넘긴다. 콤보박스는 손대지 않는다. 훅을 쪼개지 않고, 상태 파라미터로 간접 추론하지도 않는다(의도가 코드에 드러나게).

#### 원본 번호는 `useMutation`

서버가 `no-store`를 보내도 FE가 `useQuery`로 받으면 원본 번호가 React Query 캐시에 `gcTime` 동안 남고 패널을 닫아도 살아 있다. 기존 `useMemberPhoneMutation`(`packages/hooks/src/clubs.ts:244`)이 `useMutation`인 것과 같은 이유다. **`useMutation`으로 받고, Sheet를 닫으면 컴포넌트 로컬 상태와 함께 사라진다.**

### 화면

**목록** (`AdminUsersPage` / `AdminUsersTable`)
- 상태 필터(전체 / 정상 / 이용 정지) + 검색어. 검색어 없이도 목록이 보인다
- 행: 이름 · 학번 · 학과 · 역할 · 상태 뱃지 · [상세] [강제 로그아웃]
  - **가입 동아리 수는 목록에 넣지 않는다.** 행마다 COUNT가 필요해 집계 성격이고, 상세 패널에서 동아리 목록과 함께 보인다. 넣는다면 KPI와 같은 PR-4에서 한 번에 처리한다
- 상태 뱃지는 **값이 없으면 렌더하지 않는다** — 배포 전환기에 구 백엔드 응답(`status` 없음)이 와도 화면이 깨지지 않게(FE fail-open 가드 관례)
- 정지 회원 행은 배경으로 구분

**상세 Sheet** (`ui/sheet.tsx` 재사용)
- 헤더: 이니셜 Avatar + 이름 + 상태 뱃지
- 계정(조회 전용): 마스킹 번호 + [번호 확인] · 학번 · 학과 · 가입일 · 마지막 로그인(없으면 "기록 없음") · 휴대폰 인증 여부 · 계정 상태
- 가입 동아리: 동아리명 · 역할 뱃지 · 가입일, 클릭 시 `/admin/clubs/{clubId}`로 이동
- 관리자 메모: `textarea`(1000자) + [메모 저장], 하단에 "최종 수정 {adminNoteUpdatedAt} · {adminNoteUpdatedBy}"
- Danger Zone: 강제 로그아웃 / 계정 정지(또는 해제)
- 최근 운영 기록: 조치 · 사유 · 작업자 · 시각 (최근 20건)

**확인 Dialog** (`ui/dialog.tsx` 재사용)
- 정지/해제: **사유 입력 textarea(200자, 필수)**. 빈 값이면 확인 버튼 비활성
- 안내 문구: "정지 사유와 함께 감사 로그에 기록됩니다" — 목업의 "정지 사유는 관리자 메모에 기록돼요"는 설계와 반대이므로 쓰지 않는다
- 대상이 어느 동아리의 LEADER면 경고를 표시한다: *"이 회원은 ○○ 동아리의 회장입니다. 계정을 정지하면 해당 동아리 운영에 영향이 있을 수 있습니다."* — 경고만 하고 차단하지 않는다(회장 교체는 별도 기능이 있다)
- 강제 로그아웃: 기존 `AdminForceLogoutDialog` 유지

### 캐시 무효화

상태 변경·메모 저장 성공 시 해당 회원 상세와 목록 쿼리를 함께 무효화한다(요구사항 "목록 즉시 갱신"). 기존 `useAdminForceLogoutMutation`은 목록을 무효화하지 않는데(세션 상태를 목록이 담지 않으므로), 이제 감사 이력이 상세에 표시되므로 **상세는 무효화**한다.

### PR-3 테스트

- 상태 필터 전환 시 검색어 없이도 조회가 나간다
- 사유가 비면 정지 버튼이 비활성
- LEADER인 회원 정지 시 경고 문구 노출
- 마지막 로그인 null → "기록 없음"
- `status` 없는 응답에서 뱃지 미렌더(전환기 가드)
- 번호 확인 후 Sheet를 닫았다 다시 열면 마스킹 상태로 복귀

---

## PR-4 (프론트, 후속) — 리디자인 · KPI

이번 스코프에 넣지 않는다. 근거는 **목업이 쓰는 `CAdmin` / `CKpis` / `CToolbar` / `CTable` / `CTag` / `CPaging` 6개가 모두 레포에 없기 때문**이다. 실재하는 것은 `ConsoleCard`(facility-bookings 내부에 지역화), `Pagination`, `ui/sheet.tsx`, `ui/dialog.tsx`, `ui/tabs.tsx` 정도이고 요약 카드도 공용이 아니라 기능별로 따로 있다(`BookingSummaryCards`, `SubmissionSummaryCards`, `FeeSummaryCards`).

PR-3에서 목업을 그대로 구현하면 "회원 관리 기능"이 아니라 **"관리자 콘솔 디자인 시스템 신규 도입 + 회원 관리 기능"** 두 개가 된다. 게다가 그 디자인 시스템을 화면 하나의 요구만 보고 만들게 되는데, 관리자 콘솔에는 이미 페이지가 열 개 넘게 있다.

PR-4 범위:
- 목업 비주얼 적용 + 공용 콘솔 컴포넌트 추출
- **KPI/집계 API** — 전체 회원 / 이용 정지 / 신규 가입(7일) / 오늘 활성(24h). `last_login_at`이 어느 정도 쌓인 뒤에 도입해야 "활성" 숫자가 의미를 갖는다. 배포 직후 도입하면 실제의 극히 일부만 잡히고, 관리자가 매일 보는 숫자가 거짓이면 화면 전체의 신뢰가 깎인다
- **운영 기록 접기** — "최근 3건 + 더 보기". Sheet에서 무한히 자라는 건 운영 기록 하나뿐이므로(계정 정보 7필드 고정, 가입 동아리 현실적으로 1~3개, Danger Zone 버튼 2개 고정) 원인 하나만 겨냥한다. 탭 분리는 그래도 길 때 그다음 수단으로 둔다 — 탭을 넣으면 나머지 세 섹션이 이득 없이 클릭 뒤로 숨고, 특히 Danger Zone이 숨으면 "정지된 회원인데 해제 버튼이 어디 있지"를 매번 찾게 된다. `ui/tabs.tsx`가 이미 있어 그때의 비용도 낮다

---

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| D-1 | 이메일 관련 항목 전부 제거, 휴대폰으로 대체 | V81에서 email 컬럼·테이블 드롭됨. 로그인=학번, 본인확인=MO 인증 |
| D-2 | SUPER_ADMIN 보호 정책 제외 | `UserRole`은 STUDENT/ADMIN 2단계. ADMIN 정지 금지가 이미 전원을 덮음 |
| D-3 | `users.last_login_at` 컬럼 신설, 백필 없음 | `auth_event` 90일·`auth_session.last_used_at`은 rotation 갱신이라 둘 다 부정확. 로그인당 UPDATE 1회 비용은 이 서비스 볼륨에서 무의미 |
| D-4 | 감사 로그는 `auth_event` 재사용 대신 신규 테이블 | auth_event는 90일 purge + actor 컬럼 없음 + 메모 수정은 인증 이벤트가 아님 |
| D-5 | `PHONE_VIEW`는 기록하되 운영 타임라인에서 제외 | 열람은 감사 대상이지 운영 조치가 아님. 섞으면 실제 조치가 묻힘 |
| D-6 | 동일 상태 PATCH는 무동작 204 | 버튼 연타가 감사 이력을 오염시키는 것을 방지 |
| D-7 | 목록에 휴대폰 비노출 | 목록이 가장 많이 노출되는 화면. 이름·학번·학과로 식별 충분 |
| D-8 | 리디자인·KPI를 PR-4로 분리 | 목업 컴포넌트 6개가 레포에 없음 → PR-3이 디자인 시스템 도입까지 떠안게 됨 |
| D-9 | 메모 수정 메타데이터는 감사 로그에서 파생 | 컬럼 신설은 같은 사실의 이중 저장 → 불일치 위험 |
| D-10 | 캐시 방지는 `no-store` 단독 | `Pragma`는 응답 헤더로 미정의, `Expires`는 무시됨. 실질 리스크는 RQ 캐시이며 `useMutation`으로 해결 |
| D-11 | 정지 확인은 비밀번호 검증 **뒤** | 앞에 두면 학번만 아는 제3자에게 계정 상태가 노출됨 |
| D-12 | 열람 액션명은 `PHONE_VIEW` | 기존 회장 경로 서버 로그와 같은 이름 → 두 경로를 한 키워드로 검색 |
| D-13 | 감사 로그만 `timestamptz`+`Instant`, `users.last_login_at`은 naive 유지 | 새 테이블은 자유롭게 정하되, 기존 테이블의 새 컬럼은 그 테이블의 2단계 전환 계획을 따른다. `users`에만 timestamptz를 섞으면 `LocalDateTime` 저장이 JDBC 세션 존으로 캐스팅돼 prod(UTC)는 맞고 로컬(KST)은 −9h가 되는 환경별 오작동이 생긴다(TIMEZONE.md §42) |
| D-14 | `action`에 CHECK 제약 없음 | 레포의 모든 enum 컬럼이 제약 없이 `@Enumerated`로만 보장. CHECK 수정은 DROP+ADD라 액션 추가마다 마이그레이션이 붙는다 |
| D-15 | 정지 계정의 비밀번호 재설정은 차단하지 않음 | 인증 전 단계에서 계정 상태를 노출하지 않는다(D-11과 같은 논리). 재설정해도 로그인은 여전히 막힌다 |
| D-16 | 메모 내용이 그대로면 무동작 204 (저장·로그·최종 수정 정보 모두 불변) | 안 고친 사람이 최종 수정자로 찍히는 것은 부정확하고, 잦은 메모 저장이 20칸짜리 조치 이력에서 정지·해제를 밀어낸다. D-6과 같은 원칙 |
| D-17 | 감사 로그 `reason`은 영구 보존 — 파기 대상으로 만들지 않음 | 조치 근거가 사라지면 감사 로그의 존재 이유가 없어진다. 대신 `reason`에 개인정보를 쓰지 않는 운영 원칙으로 유입 자체를 막는다 |

---

## Out of Scope

이번 4개 PR에서 **구현하지 않는다.**

- 관리자 권한 부여/회수 (STUDENT ↔ ADMIN 전환)
- 회원 정보 직접 수정 (이름·학과·학년·휴대폰)
- 비밀번호 변경·초기화
- 다른 사용자로 로그인(Impersonate)
- 휴대폰 번호로 회원 검색 — 개인정보 검색 축이 하나 더 생기고(하이픈 정규화, 부분 일치 허용 범위, 그 자체가 감사 대상) 별도 판단이 필요하다
- 학과·단과대 필터 — `major`는 자유 입력 문자열이라 선택지를 만들 수 없다. `college`(enum) 필터는 가능하지만 이번 합의 범위 밖
- 감사 로그 전용 조회 화면 / 기간·종류 필터 / CSV 내보내기 — 회원 상세의 최근 20건만 제공
- 감사 로그 보존기간 정책·purge 잡 — 영구 보존으로 둔다
- 정지 회원을 다른 화면(동아리 멤버 명단, 지원자 목록 등)에서 구분 표시
- 정지에 따른 부수 처리 — 진행 중인 지원서·시설 예약·회장직은 그대로 유지된다
- 정지 예약/자동 해제(기간제 정지)
- KPI·집계 API → PR-4
- 목업 디자인 시스템(`CAdmin` 등) 도입 → PR-4
- Sheet 탭 분리 → PR-4에서 "운영 기록 접기"를 먼저 시도한 뒤 판단

---

## 주요 함정 (구현 시 확인)

1. **`GET .../phone`의 readOnly 트랜잭션** — 조회처럼 생겼지만 INSERT를 한다. 클래스 레벨 `readOnly=true`에 걸리면 H2 통과·실 Postgres 500. TestContainers 통합 테스트 필수
2. **무검색 목록의 정렬** — `ORDER BY` 없이 페이징하면 Postgres가 순서를 보장하지 않아 페이지 간 행 중복·누락. `createdAt DESC, id DESC` 고정
3. **검색 훅 `enabled` 게이트** — 그냥 풀면 동아리장 검색 콤보박스가 전체 회원을 드롭다운에 쏟아붓는다. `allowEmptyQuery` opt-in으로만 연다
4. **`token_version` lost update** — 상태 변경도 기존 `forceLogout`/`changePassword`와 동일하게 `findByIdForUpdate` 행잠금 안에서 수행
5. **`adminNote` 유출** — `User` 엔티티에 필드가 생기므로 사용자 대면 응답에 새어나가지 않는지 회귀 테스트로 고정
6. **FE `status` fail-open** — "알려진 값일 때만 뱃지 표시". `status !== 'ACTIVE'`로 분기하면 전환기에 전원이 정지로 보인다
7. **정지 확인 순서** — 비밀번호 검증 뒤(D-11)
8. **타임스탬프 변환 — 한 응답 안에 regime 이 세 갈래다.** 컬럼 타입이 아니라 **그 필드를 기록한 코드**가 regime 을 결정한다(`TIMEZONE.md`가 SoT).
   - **system regime**(무클럭 `LocalDateTime.now()` 저장 / JPA auditing): `createdAt`(가입일), `lastLoginAt`, 동아리 `joinedAt` → `TimeMapper.systemWallClockToInstant`. `last_login_at` 저장값은 기존 `login()`의 `now`를 그대로 재사용해 `created_at`과 같은 기준을 유지한다
   - **seoul regime**(`LocalDateTime.now(seoulClock)` 저장): **`phoneVerifiedAt`** → `TimeMapper.seoulWallClockToInstant`. 가입(`markPhoneVerified`)·번호 변경(`changePhone`) 두 writer 가 모두 seoulClock 을 쓴다. systemDefault 를 태우면 **prod(JVM=UTC)에서 +9시간** 어긋나는데, 로컬·CI 는 JVM 이 KST 라 두 변환 결과가 같아 **테스트로 절대 드러나지 않는다**
   - **변환 불요**: 감사 이력의 `at` 은 이미 `Instant`(timestamptz) — `TimeMapper` 를 태우면 이중 변환이다

   새 시각 필드를 응답에 노출할 때는 **writer 를 먼저 찾아 regime 을 확인하고 `TIMEZONE.md` 대응표에 행을 추가한다.** 그 표는 2단계 백필 명세를 겸하므로, 누락되면 `phone_verified_at` 의 `AT TIME ZONE 'Asia/Seoul'` 보정이 마이그레이션에서 빠진다.
