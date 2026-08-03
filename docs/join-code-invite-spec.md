# 가입 코드 기반 회원 초대 — 스펙

외부 폼(구글폼·네이버폼 등)으로 모집한 합격자를 두잉 회원으로 등록하는 기능.
두잉은 User(Account) 기반으로 회원을 관리하므로 CSV 회원 직접 생성은 지원하지 않고,
**가입 코드 → 가입 요청 → 운영진 승인** 흐름으로 실제 User 기반 ClubMember 를 생성한다.

---

## 1. 배경·목표

- 외부 폼 모집 인원을 간편하게 회원 등록한다.
- 모든 회원은 반드시 실제 User(Account) 를 기반으로 생성한다 (`applicationMode=EXTERNAL` 모집의 합격자는
  두잉에 지원서가 없어 기존 "지원 승인 → ClubMember 생성" 경로로 들어올 수 없다 — 이 갭을 메운다).
- 운영진의 관리 부담을 최소화한다 (일괄 승인 지원).

## 2. 전체 플로우

```
외부 폼 합격
  ↓
운영진: 가입 코드 생성 (기수·최대 인원·만료 지정)
  ↓
학생: /join/{code} 접속 (비로그인이면 로그인·회원가입 후 복귀)
  ↓
학생: 동아리 확인 → 가입 요청 생성 (JoinRequest, PENDING)
  ↓
운영진: "가입 요청" 탭에서 외부 폼 합격자 명단과 대조 → 승인/거절 (일괄 승인 지원)
  ↓
승인 시: ClubMember 생성 (기존 공통 로직 재사용)
```

**요청 생성 시점에** 코드의 사용 인원을 차감해 자리를 확보하고, 거절되면 환급한다.
ClubMember 는 **승인 시점에만** 생성한다.

## 3. 도메인 모델

### club_join_code

| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | bigint | PK |
| club_id | bigint | FK(club), not null |
| recruitment_id | bigint | FK(recruitment), not null — 코드가 귀속된 외부 폼(EXTERNAL) 모집 |
| code | varchar(6) | unique, not null — Crockford Base32(혼동 문자 I/L/O/U 제외) 6자, SecureRandom |
| generation | int | null 허용 (미지정 코드 가능) |
| max_uses | int | not null, 1~500 |
| used_count | int | not null, default 0 |
| expires_at | timestamp | not null — 생성 시점 + 7/30/90일 (무기한 없음) |
| revoked_at | timestamp | null — 폐기 시각 |
| created_at / updated_at / deleted_at | | BaseEntity 공통 |

- **동아리당 활성 코드 1개**: partial unique `(club_id) WHERE revoked_at IS NULL AND deleted_at IS NULL`
- 재생성 = 기존 활성 코드 폐기(revoked_at 기록) + 신규 생성, 단일 트랜잭션. 재생성 시 기수 변경 가능.
- 폐기·만료된 코드 행은 보존한다 (JoinRequest 가 FK 로 참조, 감사 이력).
- 코드 행은 soft-delete 하지 않는다(폐기 = revoked_at 기록). code 전역 unique 와 중복 검사(existsByCode)가 이 전제에 의존한다.

### club_join_request

| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | bigint | PK |
| club_id | bigint | FK(club), not null |
| user_id | bigint | FK(users), not null |
| join_code_id | bigint | FK(club_join_code), not null |
| generation | int | null 허용 — **요청 생성 시점 코드의 기수 스냅샷** |
| status | varchar(20) | PENDING / APPROVED / REJECTED |
| reject_reason | varchar(100) | null — 자동 거절 사유 기록용 (운영진 수동 거절은 null) |
| reviewed_by | bigint | FK(users), null — 처리 운영진 |
| reviewed_at | timestamp | null |
| version | bigint | not null — `@Version` 낙관적 잠금 (동시 처리 충돌 검출, Application·LeaderSuccessionRequest 전례) |
| created_at / updated_at / deleted_at | | BaseEntity 공통 |

- **PENDING 중복 방지**: partial unique `(club_id, user_id) WHERE status = 'PENDING' AND deleted_at IS NULL`
- 코드가 재생성되어 기수가 바뀌어도 기존 요청은 **생성 당시 스냅샷 기수**로 승인된다.

> **사용 이력 테이블은 별도로 두지 않는다.** "누가·언제·어떤 코드로 가입했는지"는
> APPROVED 상태의 JoinRequest(join_code_id, user_id, reviewed_by, reviewed_at)가 그대로 감사 이력이며,
> 사용 인원 집계는 `used_count` 컬럼(원자적 차감)이 담당한다. 제3의 테이블은 중복이므로 만들지 않는다.

## 4. 정책

### 4.1 코드 정책

- **생성 조건(외부 폼 모집 한정)**: 해당 동아리에 `applicationMode = EXTERNAL` 이고 상태 `OPEN` 인 모집이
  있을 때만 생성할 수 있으며, 코드는 그 모집에 귀속된다(복수면 최신 1건). 조건 미충족 시 409 거부.
  - INTERNAL(자체 폼) 모집만 있음 → 생성 불가
  - EXTERNAL + CLOSED → 생성 불가
  - EXTERNAL + OPEN → 생성 가능
- **모집 종료 시**: 귀속 모집이 CLOSED 되면 코드는 즉시 **신규 가입 요청 생성 불가**가 된다.
  구현은 사용 가능 판정에 "귀속 모집 OPEN" 조건을 포함하는 **파생 방식** — 마감 경로(수동·자동)마다
  폐기 훅을 심는 대신 판정 한 곳으로 모든 경로를 커버한다(revoked_at 은 운영진 수동 폐기 전용으로 유지).
  이미 생성된 PENDING 요청은 기존 정책대로 정상 승인/거절 가능하다.
- 생성 입력: 최대 사용 인원(필수, 1~500) · 만료 기간(7/30/90일 중 택1, 기본 30일) · 기수(선택)
- 무기한 옵션은 제공하지 않는다.
- 만료·폐기·소진(used_count ≥ max_uses)·**모집 마감**된 코드로는 **신규 가입 요청을 생성할 수 없다**.
  단, 이미 생성된 PENDING 요청은 이후 코드가 만료·폐기·재생성·모집 마감되더라도 정상 승인 가능하다.

> **정책 목적**: 가입 코드는 외부 폼 모집 합격자 등록의 **보조 기능**으로 한정한다. 두잉 자체 모집(INTERNAL)과
> 동시 사용을 막아 모집 경로의 일관성을 유지하고, 기존 지원 → 승인 → ClubMember 흐름과의 충돌·우회 가입을 방지한다.

### 4.2 가입 요청 생성 정책

요청 생성 시 다음을 검증한다 (모두 단일 트랜잭션):

- 코드 유효성 (존재·미폐기·미만료·미소진·**귀속 모집 OPEN**·**동아리 ACTIVE**) — 모집 마감·비 ACTIVE 동아리의 코드는 확인(usable=false)·요청 생성 모두 무효 취급 (승인측 requireActiveClub 과 대칭, 처리 불가 PENDING 누적 방지)
- **사용 인원 차감은 요청 생성 시점** — 코드 행 잠금(PESSIMISTIC_WRITE) 하에 원자 차감. 잔여가 없으면 생성 불가(소진 = 무효 코드와 동일한 단일 안내). `used_count` 는 "대기 + 승인" 요청 수를 의미하며, 운영진 콘솔 카운트는 신청 즉시 반영된다
- 현재 활성 ClubMember 인 경우 → 생성 불가, "이미 가입된 동아리입니다."
- PENDING 요청 존재 → 생성 불가
- REJECTED 이력 → 재요청 가능
- APPROVED 이력만으로는 차단하지 않는다 (탈퇴 후 재가입 허용 — 기존 ClubMember partial unique 설계와 동일 정책)
- 요청 생성 시 코드의 generation 을 스냅샷 저장

### 4.3 승인/거절 정책

승인 시 다음을 **단일 트랜잭션**으로 수행한다 (**차감 없음** — 슬롯은 요청 생성 시 이미 확보됨):

1. ClubMember 생성 — **기존 공통 서비스**(지원 승인과 동일 로직: upgrade-or-insert, 탈퇴 후 재가입, 동시성 멱등) 호출,
   generation 은 요청의 스냅샷 값 전달
2. JoinRequest 상태 변경 (APPROVED) + reviewed_by/reviewed_at 기록

- **승인 시점에 이미 다른 경로로 활성 ClubMember 가 된 경우**: 해당 요청은 자동으로 REJECTED 처리한다
  (reject_reason = "이미 가입된 회원"). PENDING 으로 방치하지 않는다.
- **거절(수동·자동) 시 차감을 되돌린다(환급)** — 코드 행 잠금 하에 used_count 감소(0 하한).
  거절된 신청이 자리를 영구 소모하면 합격자가 못 들어오므로 환급은 필수다.
- **같은 요청을 두 운영진이 동시에 처리**하면 `@Version` 낙관적 잠금으로 뒤늦은 처리가 409 거부된다 (이중 차감·거절 덮어쓰기 방지).
- 승인은 코드 만료·폐기와 무관하게 가능하다 (요청 생성 시점에 이미 코드 검증을 통과했으므로).

### 4.4 일괄 승인(Bulk Approve)

- **건별 처리**: 각 요청은 독립 트랜잭션으로 승인되며, 실패가 다른 요청에 영향을 주지 않는다.
- 실패 항목은 사유와 함께 반환한다: 이미 가입된 회원(자동 거절됨) / 이미 처리된 요청 / 동시 처리 충돌 등.
  (승인은 차감하지 않으므로 "잔여 인원 부족" 실패는 승인 단계에 존재하지 않는다 — 소진은 신청 단계에서 차단)
- 기존 지원 도메인의 벌크 처리(bulkUpdateStatus — self-proxy 건별 트랜잭션) 패턴을 따른다.

### 4.5 보안

- 코드 생성: SecureRandom + Crockford Base32 (기존 PhoneVerificationCodeDeriver 와 동일 문자셋)
- **Rate Limit**: 코드 확인·가입 요청 생성 API 에 IP 기반 제한 — 기존 PhoneVerificationRateLimiter 패턴 재사용
  (브루트포스로 유효 코드를 찾아도 결과는 "요청 생성"일 뿐이지만, 코드 열거·스팸 요청 방지)
- 비로그인 상태에서도 코드 확인(동아리명 표시)은 허용한다 — rate limit 으로 완화
- `/join/{code}` 복귀용 returnTo 는 기존 `toLinkRoute` 오픈 리다이렉트 가드를 반드시 통과시킨다
- 운영진 API 는 기존 clubId 소유권 검증(clubAuthService.requireManager)을 태운다
- **Security 매처 주의**: `GET /api/v1/clubs/**` 가 전역 permitAll 이므로, 운영진 조회 3종(join-codes/active·join-requests 목록/상세)은 authenticated 매처를 permitAll **앞에** 명시해야 한다 (members·facility-bookings 전례 — 누락 시 전화번호 포함 상세가 비로그인에 노출)

## 5. API

### 운영진 (동아리 관리 권한 필요)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/v1/clubs/{clubId}/join-codes` | 코드 생성(기존 활성 코드 자동 폐기 = 재생성). 201 — **OPEN 상태 EXTERNAL 모집이 없으면 409** |
| GET | `/api/v1/clubs/{clubId}/join-codes/active` | 활성 코드 조회 (code, 기수, 사용/최대 인원, 만료일). 없으면 200 + data null (`jsonOkNullable` 규약) |
| DELETE | `/api/v1/clubs/{clubId}/join-codes/{joinCodeId}` | 코드 폐기. 204 — 이미 폐기된 코드는 no-op 멱등(revoked_at 미변경) |
| GET | `/api/v1/clubs/{clubId}/join-requests?status=` | 가입 요청 목록 (이름·학번·학과·요청일·코드·기수) |
| GET | `/api/v1/clubs/{clubId}/join-requests/{joinRequestId}` | 상세 (**전화번호는 상세에서만** — 기존 지원자 상세와 동일 전례) |
| PATCH | `/api/v1/clubs/{clubId}/join-requests/{joinRequestId}` | 승인/거절 단건. 200 + `result`(APPROVED/REJECTED/AUTO_REJECTED) — 자동 거절 결과 전달 위해 204 규약 예외 |
| PATCH | `/api/v1/clubs/{clubId}/join-requests/bulk-approve` | 일괄 승인 — 건별 결과(성공 수·실패 목록+사유) 반환. 200 (`PATCH /leader/applications/bulk-status` 선례) |

### 학생

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/v1/join-codes/{code}` | 코드 확인 — 동아리명·기수·유효 여부. 인증 시 내 요청 상태 포함. 비로그인 허용, rate limit |
| POST | `/api/v1/join-codes/{code}/requests` | 가입 요청 생성. 인증 필수, rate limit. 201 |

응답의 시각 필드(expiresAt·requestedAt·reviewedAt)는 `TIMEZONE.md` 신규 API 절대 규칙에 따라 Instant(UTC) + TimeMapper 로 반환한다 (LocalDateTime JSON 금지).

## 6. 화면

### 운영진 — 회원 관리 (`/manage/clubs/{clubId}/members`)

- **회원 초대**: 활성 코드 카드 — 코드·링크 표시, 복사, 사용/최대 인원, 만료일, 기수 / 재생성(기수 변경 가능) / 폐기.
  귀속 모집이 마감되면 "모집 마감으로 사용 불가" 표시. OPEN 상태 EXTERNAL 모집이 없으면 생성 폼 대신 안내 문구
- **가입 요청 화면** (회원 관리에서 진입하는 별도 라우트 `/manage/clubs/{clubId}/members/requests`, 대기 수 배지):
  목록(이름·학번·학과·요청일·코드·기수) → 상세(+ 전화번호) → 승인/거절, 체크박스 일괄 승인

### 학생 — `/join/{code}`

- 비로그인: 동아리 정보 표시 + 로그인/회원가입 유도 (`next=/join/{code}`, toLinkRoute 검증).
  **회원가입 경로 복귀 포함** — 로그인 화면의 회원가입 링크가 next 를 전파하고, 가입 완료 후에도 next 가
  유지되어 `/join/{code}` 로 복귀한다 (현재 signup 은 `/login?next=/me` 하드코딩이라 FE 수정 필요)
- 로그인: 동아리 확인 → [가입 요청] 버튼
- 상태 분기 (우선순위 순):
  1. 현재 활성 멤버(alreadyMember) → "이미 가입된 동아리입니다" + 동아리 페이지 링크
  2. PENDING → "가입 요청 대기 중" + **[홈으로 돌아가기] 버튼**
  3. 그 외(이력 없음 · REJECTED · **탈퇴 후 과거 APPROVED**) → 유효한 코드면 [가입 요청] 가능
     (APPROVED 이력을 종결 화면으로 취급하면 탈퇴 후 재가입(4.2)을 FE 가 막게 되므로 금지)
  4. 유효하지 않은 코드(미존재·만료·폐기·소진·비 ACTIVE 동아리) → 사유 구분 없는 단일 안내

학생의 가입 요청 상태 확인은 `/join/{code}` 재방문으로 제공한다 (마이페이지 노출은 후속).

## 7. Out of Scope

- 운영진 자동 승인 (승인 없는 즉시 가입)
- CSV 를 통한 회원 직접 생성 / User 없는 회원 생성 / 이름만으로 회원 생성
- CSV 를 통한 가입 코드 일괄 생성
- 이메일 기반 초대
- 다중 활성 가입 코드
- 학생의 가입 요청 취소 (CANCELED 상태)
- 마이페이지 내 가입 요청 상태 표시
- QR 코드 이미지 생성 (링크가 있으므로 후속에서 FE 단독 추가 가능)
- 외부 폼 URL(externalFormUrl) 화이트리스트 검증 — **별도 스펙·별도 PR 트랙**

## 8. 구현 순서 (PR 스택 — 모두 develop 분기)

1. `refactor(backend)`: ClubMember 생성 로직 공통 서비스 추출 — 동작 변화 없음, generation 파라미터 지원
2. `feat(backend)`: 가입 코드 관리 API (엔티티·마이그레이션·생성/조회/폐기)
3. `feat(backend)`: 가입 코드 확인·가입 요청 생성 API (학생측 + rate limit)
4. `feat(backend)`: 가입 요청 조회·승인/거절/일괄 승인 API (운영진측)
5. `feat(frontend)`: 운영진 회원 초대·가입 요청 콘솔
6. `feat(frontend)`: `/join/{code}` 페이지

의존 관계상 앞 PR 머지 후 다음 분기(또는 스택 PR). 상세 태스크는
`docs/superpowers/plans/2026-08-03-join-code-invite.md` 참조.
