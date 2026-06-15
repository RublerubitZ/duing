# LEADER 측 중앙동아리 재인증 신청 모달 설계

작성일: 2026-06-04
관련 도메인: Club / Recertification (REQUIREMENTS §2.7 — RC-1)

## 배경

REQUIREMENTS §2.7 의 중앙동아리 연간 재인증 플로우는 ADMIN 측(라운드 열기·요청 처리·미인증 조회)이 백엔드·프론트 모두 구현돼 있으나, **LEADER 측 제출(`RC-1`) 은 백엔드 API 만 존재하고 프론트 UI 가 누락**돼 있다. 그 결과 ADMIN 이 라운드를 열어도 회장이 시스템에서 신청할 경로가 없어 풀 플로우가 끊겨 있다.

이번 작업은 회장 콘솔(`/manage/clubs/[clubId]`) 에 "재인증 신청" 진입점을 추가하고, 신청 가능 여부를 사전 안내하는 컨텍스트 조회 + 제출 모달을 신설해 RC-1 을 사용 가능 상태로 끌어올린다.

## 목표

1. 회장이 본인 동아리에서 OPEN 재인증 라운드에 신청을 제출할 수 있는 UI 제공.
2. 클릭 전에 자격(중앙동아리 여부·라운드 존재·중복 PENDING)을 모달이 알려줘 헛클릭/혼란 최소화.
3. 기존 패턴(`PromotionRequestModal`) 과 일관된 코드·UX 로 유지비 최소화.

## 변경 범위

### 백엔드

신규 GET 엔드포인트 1 개 추가. POST 엔드포인트와 DB 스키마는 변경 없음.

- `GET /api/v1/clubs/{clubId}/recertification-context` — LEADER 전용.
  - 응답:
    ```jsonc
    {
      "centralClub": true,
      "lastVerifiedYear": 2025,
      "openRound": { "id": 7, "year": 2026, "label": "2026 상반기 재인증" },
      "pendingRequest": {
        "id": 42,
        "operatingYear": 2026,
        "contactEmail": "leader@daegu.ac.kr",
        "contactPhone": "010-1234-5678",
        "createdAt": "2026-06-01T10:23:00"
      }
    }
    ```
  - `openRound` 는 전역 `RoundStatus.OPEN` 라운드 1건 (없으면 `null`).
  - `pendingRequest` 는 `(openRound.id, clubId, status=PENDING)` 매칭 1건 (`openRound==null` 시 무조건 `null`).
  - 권한: 컨트롤러에서 `ClubAuthService.requireLeader(currentUser.id(), clubId)` 통과 후 서비스 진입. OFFICER/비-멤버는 403, 미인증 401, 존재하지 않는 clubId 는 404.

기존 `POST /api/v1/clubs/{clubId}/recertification-requests` 는 DTO·로직 변경 없이 그대로 사용.

#### 파일 변경

```
backend/src/main/java/com/duing/domain/club/
├── api/LeaderRecertificationApi.java                  [수정] getContext 시그니처 추가
├── controller/LeaderRecertificationController.java    [수정] getContext 구현
├── controller/dto/response/
│   └── RecertificationContextResponse.java            [신규] record + nested OpenRoundView, PendingRequestView
├── service/RecertificationRequestService.java         [수정] getLeaderContext(clubId) 추가
└── service/GeneralRecertificationRequestService.java  [수정] 구현
```

- DB 변경 없음 → Flyway 마이그레이션 불필요.
- 서비스 메서드는 순수 조회. 권한 체크는 컨트롤러에서 끝낸다.
- 정적 팩토리: `RecertificationContextResponse.of(Club club, RecertificationRound openRound | null, RecertificationRequest pendingRequest | null)`.

### 프론트엔드

#### 패키지 레이어

```
frontend/packages/types/src/recertification.ts        [신규] LeaderRecertificationContext, OpenRoundSummary, LeaderPendingRecertification
frontend/packages/schemas/src/recertification.ts      [신규] submitRecertificationRequestSchema (zod)
frontend/packages/api/src/client.ts                   [수정] recertificationRequests.{context,submit}
frontend/packages/hooks/src/leaderRecertification.ts  [신규] useRecertificationContextQuery, useSubmitRecertificationRequestMutation
frontend/packages/hooks/src/queryKeys.ts              [수정] leaderRecertification 키 추가
frontend/packages/hooks/src/index.ts                  [수정] re-export
```

API 클라이언트 추가 (기존 `promotionRequests` 옆):

```ts
recertificationRequests: {
  context: (clubId) =>
    jsonOk<LeaderRecertificationContext>(
      http.get(`clubs/${clubId}/recertification-context`),
    ),
  submit: (clubId, payload) =>
    jsonOk<number>(
      http.post(`clubs/${clubId}/recertification-requests`, { json: payload }),
    ),
},
```

Zod 스키마 (백엔드 Bean Validation 과 1:1):

```ts
export const submitRecertificationRequestSchema = z.object({
  contactEmail: z.string().email('이메일 형식이 올바르지 않습니다.').max(255),
  contactPhone: z.string().min(1, '연락처는 필수입니다.').max(40),
  operatingYear: z.number().int().min(2000).max(2100),
  notes: z.string().max(2000).optional().or(z.literal('')),
});
```

#### UI

```
frontend/apps/web/app/manage/clubs/[clubId]/
├── _components/RecertificationRequestModal.tsx       [신규]
└── page.tsx                                          [수정] 헤더에 "재인증 신청" 버튼 + 모달 마운트
```

`page.tsx` 헤더 변경:
- 기존 "홍보 요청" / "신규 모집 작성" 버튼 옆에 "재인증 신청" 버튼 추가.
- 버튼은 **항상 표시**. 자격·라운드 조건은 모달 안에서 안내한다 (페이지에서 미리 fetch 하지 않는다).

`RecertificationRequestModal` 의 상태 분기:

| 분기 | 표시 | 폼 |
|---|---|---|
| Loading | "불러오는 중…" | 숨김 |
| `centralClub === false` | "중앙동아리만 신청할 수 있습니다." | 숨김 |
| `openRound === null` | "현재 진행 중인 재인증 라운드가 없습니다." | 숨김 |
| `pendingRequest !== null` | "이미 신청하신 건이 있습니다." + 제출일·연락처·운영연도 요약 | 숨김 |
| 그 외 (가능) | `{openRound.label} ({openRound.year}년)` 헤드라인 + 폼 | 표시 |

폼 필드:
- 라운드(readonly): `openRound.label (openRound.year년)` 텍스트 + `operatingYear` 는 `openRound.year` 로 hidden 주입.
- 대표 이메일 (필수, prefill = `currentUser.email`).
- 대표 연락처 (필수, ≤40자).
- 보충 메모 (선택, ≤2000자, 카운터 표시).

#### 캐시 정책

- `useRecertificationContextQuery(clubId)`: `enabled: modalOpen && Number.isFinite(clubId)`, `staleTime: 0`, `gcTime: 0`. 모달이 열릴 때마다 fresh fetch.
- `useSubmitRecertificationRequestMutation` `onSuccess`: `invalidateQueries({ queryKey: leaderRecertificationKeys.context(clubId) })`.

## 에러 처리 매트릭스

| 상황 | UI 처리 |
|---|---|
| context 401 | 글로벌 인터셉터가 로그인 페이지로 이동 — 모달에서 별도 처리 X |
| context 403 | "이 동아리의 회장만 신청할 수 있습니다." |
| context 404 | "동아리를 찾을 수 없습니다." |
| context 5xx | "정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요." + 재시도 버튼 |
| submit 400 NotCentralClub | "중앙동아리만 신청할 수 있습니다." + context refetch |
| submit 400 NoOpenRound | "현재 진행 중인 재인증 라운드가 없습니다." + context refetch |
| submit 409 DuplicatePending | "이미 진행 중인 신청이 있습니다." + context refetch |
| submit 5xx | "신청 처리 중 오류가 발생했습니다." |
| 성공 | `alert('재인증 신청이 접수되었습니다. 총동연 검토 후 처리됩니다.')` → 모달 닫기 → context invalidate |

## 테스트 전략

### 백엔드 (`LeaderRecertificationControllerTest`)

RestAssured + Fixture Monkey + TestContainers. `@DisplayName` 은 한글 문장형.

| # | 시나리오 | 기대 |
|---|---|---|
| 1 | LEADER + 중앙동아리 + OPEN 라운드 + PENDING 없음 | 200, `centralClub=true`, `openRound≠null`, `pendingRequest=null` |
| 2 | LEADER + 중앙동아리 + OPEN 라운드 없음 | 200, `openRound=null`, `pendingRequest=null` |
| 3 | LEADER + 중앙동아리 + OPEN 라운드 + 이미 PENDING | 200, `pendingRequest` 필드값 정확 |
| 4 | LEADER + 비-중앙동아리 | 200, `centralClub=false` |
| 5 | OFFICER (LEADER 아님) | 403 (`requireLeader` 정책 기준) |
| 6 | 비-멤버 | 403 |
| 7 | 미인증 | 401 |
| 8 | 존재 안 하는 clubId | 404 |
| 9 | `lastVerifiedYear` 값 반영 확인 | 200, 필드값 정확 |

기존 `createRequest` 테스트는 회귀 보호 위해 손대지 않는다.

### 프론트엔드

이번 PR 에선 `pnpm lint`, `pnpm typecheck`, `pnpm build` 그린 보장. 단위 테스트는 LEADER 측 이력 조회 PR 과 묶어서 후속.

## 코드 패턴 / 컨벤션 준수

- 백엔드: `api/` 인터페이스 → `controller/` implements → `service/` → `repository/` 순서. `@Transactional(readOnly = true)` 기본, 쓰기만 오버라이드. Record 사용, `@DisplayName` 한글 문장.
- 프론트: `'use client'` 모달에만, `useEffect` 안에서 패칭 금지, `@duing/api` 통과 후 컴포넌트는 훅만 사용, `any`/`as` 금지.
- 응답 표준: `ApiResponse.success(data)` 래핑.

## Out of Scope

이번 spec 에서 다루지 않는다 — 후속 PR/spec 으로 분리:

1. **LEADER 측 재인증 신청 이력 목록** (본인 동아리의 과거 APPROVED/REJECTED 요청 조회). 별도 백엔드 GET + 페이지 필요.
2. **OPEN 라운드 시작/마감 알림** — `notification` 도메인 통합.
3. **재인증 신청 수정/취소** — 현재 백엔드 미지원. 신규 요건 정의 필요.
4. **모바일 반응형 최적화** — 데스크톱 모달 기준만 구현.
5. **`operatingYear` ≠ `openRound.year` 케이스** — 프론트는 항상 일치시키므로 발생 X. 백엔드 강제 검증은 별도 spec.
6. **이미지/파일 첨부** — 활동 증빙 자료 업로드는 차후 요건.
7. **실시간 라운드 상태 동기화** — `staleTime: 0` 로 대응. WebSocket/push 는 후속.
8. **OFFICER 의 재인증 신청 권한 부여** — 현재는 LEADER 전용 유지.

## 리스크·체크 포인트

- **권한 정책 (5번 케이스)**: `ClubAuthService.requireLeader` 가 OFFICER 에 대해 400 을 던지는지 403 을 던지는지 구현 확인 후 테스트 기대값 맞춤.
- **Race condition**: ADMIN 이 라운드를 닫는 순간 LEADER 의 submit 이 들어오면 백엔드는 `NoOpenRoundException` (400) 반환. 프론트는 그 메시지로 폼을 닫고 context refetch. 명세대로 동작.
- **`operatingYear` 기본값**: `openRound.year` 를 hidden 으로 주입하므로 사용자는 변경 불가. 백엔드 Bean Validation 의 `2000~2100` 범위는 안전 마진.
- **신청 후 ADMIN 처리 대기 가시성**: 이번 PR 은 PENDING 상태만 보여주고 이력은 표시하지 않는다 (Out of Scope 1). 사용자가 "처리 결과 어디서 봐?" 라고 묻는다면 후속 PR 로 안내.
