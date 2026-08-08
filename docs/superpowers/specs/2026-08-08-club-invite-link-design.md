# 기존 부원 초대 링크(동아리 가입 링크) 설계 스펙

- 작성일: 2026-08-08
- 상태: 확정 — 사용자 결정 4건 + 최종 정책 1건 반영 (유효기간 24h 기본/72h 최대 · 기수 optional 유지 · `invite_expires_at` 신규 컬럼 · 자동 승인은 APPROVED 이력 재사용 · **maxUses 상한 500→150 통일**)
- 전제: 가입 코드 v2(스펙 `docs/join-code-invite-spec.md`, V97~V102)가 prod 라이브. `club_join_code.recruitment_id` NOT NULL, 발급 = `EXTERNAL && isEffectivelyOpen`, 사용 = `OPEN ‖ closed_at+프리셋`, 신청 시 원자 차감·거절 환급, `club_audit_event` 6종.
- 배경: 기존 부원 40명 규모를 두잉에 등록하려면 현재 구조상 **가짜 모집을 만들어야 한다**. 모집 링크의 보안 정책(모집 절차 우회 차단)은 그대로 두고, 모집과 무관한 **부원 초대 링크**를 분리 신설한다.

## Out of Scope (명시적 제외)

- 학번 기반 예약 가입 / 계정 없는 사용자의 사전 회원 레코드 생성 / CSV 일괄 등록 — 후속 과제.
- 신규 모집 가입 플로우 변경 · 기존 모집 링크 정책 완화 — **모집 링크 경로는 코드 한 줄도 바꾸지 않는 것이 목표** (공유 지점 4곳의 분기 추가만 허용, §5).
- 모집 링크에 QR 추가 — 이번엔 부원 초대 다이얼로그에만 도입, 모집 패널 확장은 후속.
- 유효기간 직접 입력·7일 이상 옵션 — 24h/72h 프리셋만 (사용자 확정: 초대 링크는 외부 공개 목적이 아니므로 모집 링크보다 보수적으로 제한).
- 초대 링크의 기수별 병행 발급(활성 다중) — 동아리당 활성 1개 유지. 여러 기수 혼재는 가입 후 회원 관리의 기수 변경(단건/벌크, #794)으로 처리.
- 자동 승인 건의 별도 상태/도메인 — APPROVED 이력 그대로, 표시만 "자동 승인" (사용자 확정).
- 잔재 `expires_at` 컬럼 재활용 — 하지 않는다. 기존 DROP(Contract) 계획 그대로 유지 (사용자 확정: 모집 링크의 파생 만료와 초대 링크의 절대 만료는 의미가 다르다).

---

## 1. 도메인 모델 — 링크 2종 분리

`club_join_code` 한 테이블을 유지하고 `recruitment_id` 로 종류를 판별한다.

| | 모집 가입 링크 (기존) | 부원 초대 링크 (신규) |
|---|---|---|
| `recruitment_id` | NOT NULL | **NULL** |
| 발급 조건 | `EXTERNAL && isEffectivelyOpen` (무변경) | `requireManager` 만 (모집 존재·상태 무관) |
| 만료 | `recruitment.closed_at + join_window_days` 파생 | **`invite_expires_at` 절대 시각** (발급 시 now + 24h/72h) |
| 자동 승인 | 없음 (항상 승인 게이트) | `auto_approve` 옵션 (기본 OFF) |
| 활성 1개 제약 | `(recruitment_id) WHERE revoked_at IS NULL AND deleted_at IS NULL` (V99, 무변경) | `(club_id) WHERE recruitment_id IS NULL AND revoked_at IS NULL AND deleted_at IS NULL` (신규) |
| 인원 제한 | `max_uses` **1~150**(상한 500→150 변경, §2.1) · 신청 시 차감 · 거절 환급 | 동일 메커니즘 · **1~150** |
| 기수 | 선택 입력 | 동일 (선택 입력, 미지정 허용) |
| 감사 | `club_audit_event` 6종 | 동일 6종 재사용, `recruitment_id` = null |

엔티티 변경 (`ClubJoinCode.java`):

- `recruitment` 연관을 `optional = true, nullable = true` 로 완화. **`isClubInvite()`**(= recruitment == null) 판별 메서드와 **`getRecruitmentIdOrNull()`**(감사 기록용) 추가.
- 신규 필드 `inviteExpiresAt`(LocalDateTime, seoulClock 벽시계 — revokedAt 과 동일 규약), `autoApprove`(boolean).
- 신규 팩토리 `issueClubInvite(club, code, generation, maxUses, inviteExpiresAt, autoApprove, createdById)` — `joinWindowDays` 는 NOT NULL 컬럼이라 0 을 넣는다(초대 링크에서 미사용 값임을 주석으로 명시).
- `isUsable(now)` 분기: `isRevoked()/isExhausted()` 공통 검사 후, **초대 링크면 `!now.isAfter(inviteExpiresAt)` 만 판정** — 모집 상태를 전혀 참조하지 않는다. 모집 링크 분기는 무변경.
- `getJoinExpiresAt()` 분기: 초대 링크면 `inviteExpiresAt` 반환 (운영 화면 만료 표시의 단일 출처 유지).
- 최대 인원 도달 = `isExhausted()` → `isUsable` false — 별도 "비활성화 전이"는 만들지 않는다(이미 자동 만료와 동등).

## 2. DB — V107 (Expand-only 1건)

```sql
-- V107__club_invite_join_code.sql
ALTER TABLE club_join_code ALTER COLUMN recruitment_id DROP NOT NULL;
ALTER TABLE club_join_code ADD COLUMN invite_expires_at TIMESTAMP;
ALTER TABLE club_join_code ADD COLUMN auto_approve BOOLEAN NOT NULL DEFAULT false;

-- 링크 2종의 형태 불변식: 모집 링크 ⟺ 파생 만료, 초대 링크 ⟺ 절대 만료 (둘 다이거나 둘 다 아닌 행 금지)
ALTER TABLE club_join_code ADD CONSTRAINT ck_club_join_code_link_shape
    CHECK ((recruitment_id IS NULL) = (invite_expires_at IS NOT NULL));

-- 동아리당 부원 초대 활성 링크 1개 (모집 링크의 V99 인덱스와 상호 배타 영역)
CREATE UNIQUE INDEX uk_club_join_code_active_invite_per_club
    ON club_join_code (club_id)
    WHERE recruitment_id IS NULL AND revoked_at IS NULL AND deleted_at IS NULL;
```

### 2.1 maxUses 상한 500→150 통일 (모집/초대 공통 — 사용자 최종 확정)

학교 동아리 규모상 500 은 과도하다 — 150 이면 정상 규모를 충분히 커버하고, 두 링크의 정책을 동일하게 유지해 운영·코드 복잡도를 줄인다.

```sql
-- V107 에 포함. ADD CONSTRAINT 는 기존 행을 검증하므로 max_uses > 150 행이 있으면 마이그레이션이 실패한다
-- → §10 릴리스 게이트(prod 사전 조회)가 이 실패를 배포 전에 차단한다.
ALTER TABLE club_join_code DROP CONSTRAINT club_join_code_max_uses_check;
ALTER TABLE club_join_code ADD CONSTRAINT club_join_code_max_uses_check CHECK (max_uses BETWEEN 1 AND 150);
```

- **기존 데이터 확인(사용자 지시 — 강제 축소 금지)**: dev DB 조회 완료, `max_uses > 150` **0건** (제약 이름 `club_join_code_max_uses_check` 실측 확인). prod 는 MCP 재인증 후 동일 쿼리로 확인 — §10 릴리스 게이트.
- **prod 에 >150 행이 존재할 경우의 예비 방침**: 기존 링크를 150 으로 축소하는 UPDATE 는 하지 않는다(사용자 지시). 이 경우 DB CHECK 교체를 보류하고(1~500 유지) BE/FE 검증만 150 으로 조여 **신규 발급부터** 제한한다 — `NOT VALID` 는 쓰지 않는다(기존 >150 행의 used_count 차감·환급 UPDATE 가 행 재검증에 걸려 가입 신청이 500 으로 터진다). 실측 후 사용자 보고·판단.
- BE Bean Validation `@Max(500)`→`@Max(150)`(모집·초대 공통 요청 DTO), FE 입력 상한(수동 검증 — `MemberEnrollmentSection` 은 zod 미사용), Swagger 문구, 테스트 픽스처의 150 초과 값 정리.
- 이 변경은 v2 스펙(`docs/join-code-invite-spec.md`)의 "인원 1~500" 정책을 대체한다.

- 기존 행은 전부 `recruitment_id NOT NULL + invite_expires_at NULL` 이라 CHECK 를 자동 통과 — 백필 불요.
- `auto_approve` 는 CHECK 대상에 넣지 않는다(초대 링크 전용 의미지만 모집 링크 행의 false 는 무해).
- **구 이미지 호환(롤백 안전성)**: 구 코드는 `invite_expires_at` 을 모르고 INSERT 시 recruitment_id 를 항상 채우므로 CHECK·DEFAULT 모두 통과. 초대 링크 행(recruitment NULL)은 구 이미지의 `findByCode` INNER JOIN 에 걸려 **404 fail-closed** — 데이터 호환은 안전하나, Flyway validate 정책상 릴리스 후 롤백은 레포 표준대로 roll-forward 전용.
- `MigrationExpandContractGuardTest` 통과 대상 (Expand-only — DROP·타입 변경 없음).
- 잔재 `expires_at` 은 이번 파일에서 건드리지 않는다 (기존 Contract DROP 계획 별도 유지).

## 3. 발급/폐기 정책 (부원 초대 링크)

- **권한**: `ClubAuthService.requireManager` (LEADER/OFFICER + 동아리 ACTIVE 게이트 내장) — 모집 링크와 동일 패턴, 어노테이션 아닌 서비스 레벨.
- **유효기간 프리셋 2택**: `expiresInHours ∈ {24, 72}`, 기본 24. 커맨드 compact constructor 에서 검증(`CreateJoinCodeCommand` 의 joinWindowDays 검증 전례), 위반 400. 저장은 `invite_expires_at = LocalDateTime.now(clock) + hours` 절대 시각.
- **최대 인원**: `maxUses` 1~150 (§2.1 — 모집 링크와 동일 상한). 기본값 없음(입력 필수 — 현행 동일).
- **기수**: 선택 입력, 미지정(null) 허용 — 현행 필드 재사용.
- **자동 승인**: `autoApprove` boolean, 기본 false. 생성 후 변경 불가(수정 API 없음 — 바꾸려면 재생성).
- **중복 발급**: 동아리당 활성 1개. 활성 링크가 있는 상태의 생성 = **재생성**(기존 활성 폐기 + 신규 발급 + `JOIN_LINK_REGENERATED`/구 링크 `JOIN_LINK_REVOKED` 쌍) — 모집 링크의 `create` 패턴 그대로. 동시 생성 경쟁은 신규 partial unique 충돌 → 409 `ConcurrentJoinCodeOperationException` 재사용. **교체 대상 활성 코드의 폐기는 `findWithLockById` 잠금 재조회 후 미폐기일 때만 수행** — 수동 폐기와의 경쟁이 최초 폐기 시각·폐기자를 덮어쓰거나 REVOKED 감사를 중복 기록하지 않게 한다(모집 경로의 모집 행 잠금에 해당하는 방어. 이 트랜잭션이 실제로 갈아끼웠을 때만 REGENERATED).
- **폐기**: 언제든 가능, 멱등(이미 폐기면 no-op + 감사 미기록 — "일어나지 않은 일은 기록하지 않는다" 규약 승계). 초대 링크는 언제든 재생성 가능하므로 **2단계 타이핑 확인은 두지 않는다**(모집 종료 후 폐기의 "재생성 불가" 경고와 상황이 다름 — 단일 확인 모달).
- **동아리 폐쇄**: `revokeActiveOnClubClosure` 가 recruitmentId 순회라 초대 링크가 누락된다 — 클럽 단위 벌크 폐기(`WHERE club_id = ? AND recruitment_id IS NULL AND revoked_at IS NULL`) 1건을 추가해 폐쇄 시 함께 폐기 + `JOIN_LINK_REVOKED` 기록. (누락돼도 ACTIVE 게이트가 사용을 막아 보안 무해지만, 감사 이력을 정직하게 유지한다. 모집 링크의 #869 와 같은 결.)
- **모집 삭제/마감**: 초대 링크는 모집 무참조라 영향 없음 (모집 링크 정책 무변경).

## 4. 사용(가입) 정책

- **유효 판정**: 미폐기 · 미소진 · `now ≤ invite_expires_at` · 동아리 ACTIVE (서비스 게이트 재사용). 만료/폐기/정원초과/비 ACTIVE 사유는 학생에게 비구분 단일 안내 (기존 규약).
- **자동 승인 OFF (기본)**: 기존 플로우 100% 재사용 — 잠금 조회 → 유효성 → 이미 회원 409 → PENDING 중복 409 → 원자 차감 → PENDING 생성 → `JOIN_REQUEST_CREATED`(actor=학생). 이후 승인 콘솔(단건/벌크)에서 기존 승인 절차.
- **자동 승인 ON**: 같은 트랜잭션에서 PENDING 생성 직후 즉시 승인까지 진행 —
  `enroll(club, requester, MEMBER, generation)` → `request.approve(requester, now)` → `JOIN_REQUEST_APPROVED`(actor=학생 본인).
  - 요청 행이 APPROVED 로 남아 승인 콘솔 이력·차감/환급 메커니즘·감사 스트림을 전부 무료로 재사용한다 (사용자 확정).
  - `decidedBy` = 신청자 본인. 콘솔 표시용 "자동 승인" 마커는 **컬럼 추가 없이 파생**: 요청 상세/목록 응답에 `autoApproved`(= 소속 코드의 `auto_approve`) 필드 추가 — autoApprove 코드의 요청은 전부 자동 승인 경로라 파생이 정확하다.
  - 승인 시점 이미 회원(`AUTO_REJECTED`) 분기는 도달 불가 — 이미 회원 409 검사와 enroll 이 같은 잠금 구간에 있다. 방어선으로 enrollment 서비스의 23505 멱등 처리(V7 unique)가 뒤에 있다.
- **이미 접수된 PENDING 의 승인/거절은 링크 만료·폐기 후에도 가능** — 기존 정책 승계 (자동 만료 = 신규 신청 차단만).

## 5. recruitment=NULL 전수 경로 (구현 시 수정 지점의 완결 목록)

공유 코드 수정은 아래 4곳이 전부다. 그 외 모집 링크 경로는 무변경.

| 경로 | 수정 |
|---|---|
| `ClubJoinCodeRepository.findByCode` | recruitment INNER JOIN → **LEFT JOIN** + `(recruitment IS NULL OR recruitment.deletedAt IS NULL)` — 초대 링크 조회 가능 + 죽은 모집 fail-closed(#869) 유지. club JOIN 은 그대로(초대 링크도 club 필수) |
| `ClubJoinCode.isUsable / getJoinExpiresAt` | `isClubInvite()` 분기 (§1) — 모집 상태 무참조 |
| `GeneralJoinRequestService.createRequest / decide` 의 감사 기록 2곳 | `getRecruitmentIdOrNull()` 로 null-safe (bulk 는 decide 경유라 자동 커버) |
| stale 주석 2곳 동반 수정 | `JoinRequestStatus.java:6`·`JoinCodeApi.java:32` — "승인 시 차감" 서술을 실제 동작(신청 시 차감)으로 정정 (후자는 Swagger 노출) |

무변경 확인 완료: `findWithLockByCode`(조인 없음) · `countByJoinCodeId` 카운트(코드 id 기준) · rate limiter(IP 기반) · `check()` 응답 조립(club 경유) · 승인/거절/벌크 본체 · PENDING partial unique · 환급 경로.

## 6. API

### 신규 — 클럽 스코프 3종 (v1 경로 재도입, `ClubInviteJoinCodeApi`/Controller 신설)

- `POST /api/v1/clubs/{clubId}/join-codes` — 201. body: `maxUses`(필수 1~150) · `expiresInHours`(24|72, 기본 24) · `autoApprove`(기본 false) · `generation`(선택)
- `GET /api/v1/clubs/{clubId}/join-codes/active` — 200, 없으면 data null (모집 스코프와 동일 규약)
- `DELETE /api/v1/clubs/{clubId}/join-codes/{joinCodeId}` — 204, 멱등. 소속 대조 = `joinCode.club.id == clubId && isClubInvite()` 불일치 404 (열거 차단 — 모집 링크 id 를 이 경로로 폐기 시도해도 404)
- 서비스: `JoinCodeService` 에 `createClubInvite / findActiveClubInvite / revokeClubInvite` 신설 — 기존 3개 메서드 시그니처 무변경.
- `SecurityConfig` 매처: 신규 경로 3종 인증 필수 등록 (기존 모집 스코프 매처와 동일 대우, 비로그인 401).

### 변경 — 응답 확장 (경로 무변경)

- `JoinCodeResponse`(운영 콘솔): `linkType`("RECRUITMENT"|"CLUB_INVITE") · `inviteExpiresAt`(Instant, 초대 링크만) · `autoApprove` 추가. 만료 표시는 기존 `joinExpiresAt` 필드가 초대 링크에서 `invite_expires_at` 를 실어 단일 출처 유지 (§1 getJoinExpiresAt 분기). Instant 변환은 기존 `TimeMapper.seoulWallClockToInstant`.
- `JoinCodeCheckResponse`(학생 랜딩): `linkType` · `autoApprove` 추가 — FE 문구 분기 근거 (§7).
- 요청 목록/상세 응답: `autoApproved` 파생 필드 추가 (§4).
- 학생측 경로(`GET/POST /join-codes/{code}*`)·승인측 경로·rate limit 전부 무변경.

## 7. FE

### 회원 관리 — [+ 부원 초대] (진입점 부활)

`members/page.tsx` 헤더 액션에 [부원 초대] 추가 (v2 에서 삭제한 자리 — v2 스펙 §5.1 이 "이메일/QR/직접 초대가 실제 추가될 때 진입점을 다시 만든다"고 유보한 그 시점. 코드의 현행 주석은 "모집 관리 카드의 링크 다이얼로그로 완결돼 제거" — 교체 대상). 다이얼로그는 신규 `ClubInviteDialog` — `MemberEnrollmentSection` 의 `CreateCodeForm`/`ActiveCodeCard`/`CopyButton` 패턴을 따르되 모집 결합이 없어 별도 컴포넌트로 작성:

- **생성 폼**: 유효기간 라디오(24시간 기본/72시간) · 최대 인원(1~150) · 기수(선택) · 자동 승인 토글(기본 OFF + "승인 없이 바로 가입됩니다. 링크 유출에 주의하세요" 경고문). 모집 링크 생성 폼(`CreateCodeForm`)의 상한도 150 으로 동기 수정.
- **활성 카드**: 상태(활성/만료/폐기·소진) · 만료 일시(`formatDateTimeKst`) · **가입 현황**(누적 신청 N / 최대 M · 승인 대기 P — 서버 카운트 단일 출처, FE 합산 금지 규약 승계) · [링크 복사] · [QR 표시] · [재생성] · [폐기(단일 확인)]
- **QR**: `react-qr-code` 신규 설치 (SVG 렌더, 의존성 0) — `${origin}/join/${code}` 를 다이얼로그 내 표시. 오프라인 일괄 가입 상황 대응.
- 훅/클라이언트: `client.ts` `joinCodes` 에 클럽 스코프 3종 추가, `useClubInviteCodeQuery`/`useCreateClubInviteCodeMutation`/`useRevokeClubInviteCodeMutation`. 쿼리 키는 기존 프리픽스 아래 `['clubs', clubId, 'join-code', 'club-invite']` — 승인/거절의 `invalidateAfterDecision`(joinCodesAll 프리픽스 무효화)에 자동 포함된다.
- `packages/types` 의 JoinCode 타입에 `linkType`/`inviteExpiresAt`/`autoApprove` 동기.

### 랜딩 `/join/[code]` — 문구 분기

`JoinCodeLanding` 분기 우선순위(로딩→404→이미 가입→PENDING→무효→신청 가능)는 그대로 두고, `linkType === 'CLUB_INVITE'` 면 톤만 교체:

- 진입: "합격 축하" 대신 "{동아리명} 부원 초대 — 링크 확인 후 가입을 완료해 주세요" 톤
- 자동 승인 ON: [동아리 가입하기] → 신청 성공 시 **"가입이 완료되었습니다"** + 동아리 페이지 이동 (check 의 `autoApprove` 로 분기 — 신청 API 응답 변경 없음)
- 자동 승인 OFF: 기존 "신청 완료 — 운영진 확인 후 등록" 안내 재사용
- 비로그인 `/login?next=/join/{code}` 체인·미들웨어(`/join` 공개) 무변경.

### 승인 콘솔

`JoinRequestDetailPanel`(및 목록 행)에 `autoApproved` true 면 "자동 승인" 배지 한 줄 추가. 그 외 무변경.

## 8. 보안/동시성 검증 (확인 완료 — 메커니즘 매핑)

| 케이스 | 방어 메커니즘 | 상태 |
|---|---|---|
| 만료 직전 동시 가입 | 유효성 판정이 코드 행 잠금 하 — 만료 전 접수 건은 모두 유효(경쟁 아님), 만료 후는 잠금 순서 무관 차단 | 기존 |
| 마지막 1자리 동시 가입 | `findWithLockByCode` + `tryConsume` 직렬화 (`JoinRequestCreateConcurrencyTest` 전례) | 기존 |
| maxUses 도달 후 차단 | `isExhausted` → `isUsable` false + `tryConsume` 최종 방어 | 기존 |
| 폐기 vs 신청 동시성 | 같은 코드 행의 UPDATE/FOR UPDATE 가 DB 레벨 직렬화 | 기존 |
| 재생성 시 구 링크 무효화 | 같은 트랜잭션 내 폐기+발급, partial unique 가 활성 1개 보장, 경쟁은 409 | 기존 패턴 재사용 |
| 자동 승인 중복 가입 | **같은 코드**의 신청은 코드 행 잠금으로 직렬화 → 후행은 이미 회원 409. 다른 링크와의 교차 동시 신청은 직렬화되지 않으나 승인 시 AUTO_REJECTED + V7 partial unique + 23505 멱등이 수습(무결성 유지) | §4 |
| 이미 MEMBER 재가입 | `AlreadyMemberException` 409 (잠금 하 검사) | 기존 |
| 권한 없는 발급/폐기 | `requireManager`(403) + 소속 불일치 404 + 비로그인 401(Security 매처) | 기존 패턴 |
| 코드 추측/열거 | SecureRandom 32⁶(≈10.7억) + IP rate limit(확인 분30/시200·신청 분10/시60) + 24~72h 창 + 활성 1개 — 자동 승인 ON 포함 수용 리스크로 판정 | 기존, 무변경 |

## 9. 테스트 계획 (요구 11건 → 배치)

- **신규 `ClubInviteJoinCodeControllerTest`** (통합, RestAssured): 모집 없는 동아리에서 발급 성공 / 모집 있어도 무관 / 프리셋 검증(24·72 외 400, 기본 24) / **maxUses 150 초과 400·경계 150 성공** / 재생성(REGENERATED+REVOKED 쌍) / 폐기 멱등 / 권한(비운영진 403·타 동아리 404·비로그인 401) / 감사 이벤트 행 검증(recruitment_id null).
- **maxUses 150 통일**: 모집 링크 생성 151 → 400 / DB CHECK 151 INSERT 거부(repository 레벨) / 기존 테스트 픽스처에서 150 초과 값 사용처 정리.
- **`JoinCodeControllerTest` 확장**: 초대 링크 check 응답(linkType·autoApprove) / 만료 경계(72h+1s 차단 — 하드코딩 미래 날짜 금지, 상대 시각) / 소진·폐기 차단 / 자동 승인 ON → 즉시 MEMBER + APPROVED 행 + 감사 2건 / OFF → PENDING + 기존 승인 절차 / 이미 회원 409 / 비 ACTIVE 동아리 차단.
- **동시성**: 초대 링크 동시 생성 → 활성 1개 (신규 인덱스 검증) / 자동 승인 동시 신청 → 멤버 1명·후행 409. 잔여 1명 경쟁은 기존 테스트가 메커니즘을 커버하므로 중복 작성하지 않는다.
- **회귀**: 기존 joincode 테스트 스위트 전체 무수정 통과 = "모집 링크 기존 동일 동작"의 증명. `findByCode` LEFT JOIN 전환 후 #869 죽은 모집 fail-closed 테스트 통과 필수.
- **FE**: `ClubInviteDialog` 테스트(생성 폼 검증·현황 표시·QR 렌더), 랜딩 분기 테스트(CLUB_INVITE 톤·자동 승인 성공 문구), hooks 테스트. 기존 `join-code-page.test.tsx` 등 무수정 통과.
- **마이그레이션**: `MigrationExpandContractGuardTest` 통과, CHECK 불변식 위반 INSERT 거부 확인.

## 10. 릴리스

- **릴리스 게이트(필수)**: prod DB 에 `SELECT count(*) FROM club_join_code WHERE max_uses > 150` 실행 — 0건 확인 후 배포. 0건이 아니면 §2.1 예비 방침으로 전환하고 사용자 보고 (V107 의 CHECK 교체가 기존 행 검증에 걸려 마이그레이션 실패 → 배포 실패가 되므로, 이 게이트 없이 배포 금지). dev 는 0건 실측 완료.
- BE(V107 포함) → FE 순 머지, 같은 릴리스로 배포 (FE 가 신규 API 의존).
- V107 은 Expand-only — 구 이미지와 데이터 호환(초대 링크 행은 구 이미지에서 404 fail-closed). 릴리스 후 롤백은 레포 표준 roll-forward 원칙.
- 기존 링크·요청 데이터 백필 없음.

## 11. 남은 후속 과제 (이번 미구현)

- 학번 예약 가입·CSV 일괄 등록·이메일 초대 (Out of Scope 승계)
- 모집 링크 패널 QR 확장
- 잔재 `expires_at` Contract DROP (기존 계획, 이번 릴리스와 무관하게 별도)
- `club_audit_event` 조회 UI (v2 부터 이월)
