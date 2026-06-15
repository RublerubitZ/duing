# 동아리 멤버 목록 CSV 다운로드 — 설계 문서 (최종)

- 작성일: 2026-06-15
- 대상 페이지: `멤버 관리` (`/manage/clubs/[clubId]/members`)
- 접근 방식: **B안 — 백엔드 JSON + 프론트 CSV 생성**
- PR 전략: **백엔드 PR → 프론트 PR** 2개 (백엔드 머지 후 프론트 착수)

---

## 1. 목표

동아리 회장(LEADER)이 `멤버 관리` 페이지에서 소속 멤버 명단을 **CSV 파일로 다운로드**한다.
두잉 코드베이스의 기존 Export 패턴(JSON 응답)과 일관성을 유지하기 위해 **B안**을 채택한다.

### 채택 이유 (과설계 회피)

- 기존 `ApiResponse<T>` 컨벤션 유지
- XLSX·바이너리 응답·`Content-Disposition`·POI 불필요
- 구현 복잡도·테스트 단순화
- MVP 단계에 적합한 최소 구조

## 2. 결정 사항

- **권한: LEADER 전용.** 다운로드 버튼·Export API 모두 `requireLeader`.
- **CSV 생성 위치: 프론트엔드.** 백엔드는 JSON 데이터만 제공한다.
- **전화번호 통제: 백엔드 API 레벨.** 프론트에서 숨기는 방식이 아니라, `includePhone` 쿼리 파라미터로 응답 데이터 자체를 제어한다. `includePhone=false` 면 `phone` 을 **`null` 로 내려보낸다**(DTO 형태 유지, 전송 구간에 PII 미포함).
- **감사 로그: 구조화 로그만(v1).** 신규 테이블·Flyway·Audit 엔티티 없음. `logger.info` 로 누가/몇 건/전화포함여부 기록. **전화번호 값 자체는 로그에 남기지 않는다.** 정식 감사 시스템은 추후 별도 도입.

## 3. Out of Scope

- XLSX 다운로드, Apache POI
- Export Writer 추상화·Resolver 패턴
- 바이너리 응답·`Content-Disposition`
- 감사 로그 **테이블**·Export 이력 조회 UI
- Rate Limiting
- 단과대학(`College`) 컬럼
- 멤버 목록 페이지네이션

---

## 4. 백엔드 설계 (PR 1)

도메인: `clubmember`. 기존 패턴(api 인터페이스 → controller → service → query/response DTO)을 따른다.

### 4.1 엔드포인트

```
GET /api/v1/clubs/{clubId}/members/export
GET /api/v1/clubs/{clubId}/members/export?includePhone=true

권한: requireLeader (회장만)
응답: 200 ApiResponse<List<ClubMemberExportResponse>>
```

- Query Parameter: `includePhone` (boolean, 기본값 `false`)
- 정렬: 기존 멤버 목록과 동일(LEADER→OFFICER→MEMBER, 그룹 내 가입일 오름차순) — `findAllByClubIdOrderedByRoleAndJoinedAt` 재사용
- 경로 `export` 는 리터럴이라 `/members/{memberId}` 와 충돌 없음(`/members/me` 선례)

### 4.2 응답 데이터 (`includePhone`)

| includePhone | 응답 필드 |
|---|---|
| `false` (기본) | 이름·학번·학과·역할·가입일 (`phone = null`) |
| `true` | 이름·학번·학과·**전화번호**·역할·가입일 |

### 4.3 신규/수정 파일

1. `service/dto/query/ClubMemberExportQuery.java` (신규 record)
   - 필드: `memberId, name, studentId, major, phone, role, joinedAt`
   - `static from(ClubMember)` — `getUser().getMajor()`, `getPhone()`. (레포지토리가 이미 `JOIN FETCH user` → N+1 없음.)
2. `controller/dto/response/ClubMemberExportResponse.java` (신규 record)
   - 동일 필드. `phone` 은 `null` 가능. `static from(ClubMemberExportQuery)`.
3. `service/ClubMemberQueryService.java` (인터페이스) + `GeneralClubMemberQueryService.java` (구현)
   - `List<ClubMemberExportQuery> getMembersForExport(Long clubId, Long requesterId, boolean includePhone)`
   - 흐름: ① `requireLeader` ② 멤버 조회·DTO 매핑 ③ `includePhone=false` 면 phone 을 null 로 ④ `logger.info("club member export: clubId={}, actorId={}, includePhone={}, count={}", ...)` (전화번호 값 미기록) ⑤ 반환
4. `api/ClubMemberApi.java` — `@Operation` + `@GetMapping("/clubs/{clubId}/members/export")` + `@RequestParam(defaultValue="false") boolean includePhone` 시그니처 추가
5. `controller/ClubMemberController.java` — `exportMembers` 구현 → `ApiResponse.success(...)`

> 기존 `ClubMemberResponse` / `ClubMemberQuery` / `listMembers` 는 **건드리지 않는다.**

### 4.4 백엔드 테스트 (`ClubMemberControllerTest` 셋업 재사용)

- 회장 호출 → 200, `data` 3건, `data.role` = `[LEADER, OFFICER, MEMBER]` (정렬 검증)
- 운영진/일반멤버/비멤버 → 403
- `includePhone=false`(기본) → `data.phone` 전부 `null`
- `includePhone=true` → `data.phone` 값 존재
- 구조화 로그 기록 검증 — Logback `ListAppender` 로 해당 로그 캡처, `includePhone`·`count` 확인 (전화번호 값 미포함 확인)
- `@DisplayName` 은 요구사항 문장으로

---

## 5. 프론트엔드 설계 (PR 2 — 백엔드 머지 후)

라우트: `apps/web/app/manage/clubs/[clubId]/members`. shadcn `components/ui/popover` 활용(체크박스는 네이티브 input).

### 5.1 타입 (`packages/types/src/clubmember.ts`)

```ts
export type ClubMemberExportRow = {
  memberId: number;
  name: string;
  studentId: string;
  major: string;
  phone: string | null;
  role: ClubMemberRole;
  joinedAt: string;
};
```

### 5.2 API 클라이언트 (`packages/api/src/client.ts`)

- `clubs.membersExport(clubId: number, includePhone: boolean): Promise<ClubMemberExportRow[]>`
  → `jsonOk<ClubMemberExportRow[]>(http.get(\`clubs/${clubId}/members/export\`, { searchParams: { includePhone } }))`

### 5.3 훅 (`packages/hooks/src/clubs.ts`)

- `useClubMembersExportMutation(clubId)` — `includePhone` 을 받아 `client.clubs.membersExport` 호출(명령형 다운로드 액션, 항상 최신 명단). 캐시 무효화 없음.

### 5.4 순수 CSV 빌더 (`app/manage/clubs/[clubId]/members/_lib/membersCsv.ts`)

DOM 의존 없음 → 단위 테스트 대상.

- `MEMBER_ROLE_LABEL: Record<ClubMemberRole, string>` = `{ LEADER:'회장', OFFICER:'운영진', MEMBER:'일반멤버' }`
- `buildMembersCsv(rows: ClubMemberExportRow[], includePhone: boolean): string`
  - 헤더: `이름,학번,학과,역할,가입일` / `includePhone` → `이름,학번,학과,휴대전화,역할,가입일`
  - 행: `name, studentId, major, [phone], 역할라벨, joinedAt.slice(0,10)`
  - 이스케이프(RFC 4180): `"` `,` `\n` `\r` 포함 시 `"` 로 감싸고 내부 `"`→`""`
  - 줄바꿈 `\r\n`(CRLF), 맨 앞 UTF-8 BOM(`﻿`) — 엑셀 한글 깨짐 방지
- `buildMembersCsvFilename(clubName: string, today: Date): string`
  - `\`${safe(clubName)}_멤버목록_${yyyy-MM-dd}\`.csv` (예: `AI동아리_멤버목록_2026-06-15.csv`)
  - `safe()` 는 파일명 불가 문자(`/ \ : * ? " < > |`)를 `_` 로 치환

### 5.5 다운로드 트리거 (`app/_lib/downloadFile.ts`)

- `downloadTextFile(filename, content, mimeType='text/csv;charset=utf-8'): void`
  - `new Blob([content], {type})` → `URL.createObjectURL` → 임시 `<a download>` 클릭 → `revokeObjectURL`
  - DOM 사용 → `packages/*` 금지 규칙 때문에 앱 레벨 `_lib`

### 5.6 팝오버 컴포넌트 (`_components/MemberCsvDownloadPopover.tsx`)

- 트리거 버튼 `멤버 명단 다운로드` (헤더 톤 `rounded-xl border border-line ...`)
- 패널: `전화번호 포함` 체크박스(기본 해제) + 보조문구 "전화번호를 포함하면 개인정보가 포함됩니다." + `다운로드` 버튼
- 동작: `mutate(includePhone)` → `onSuccess(rows)` → `downloadTextFile(buildMembersCsvFilename(clubName, new Date()), buildMembersCsv(rows, includePhone))` → 팝오버 닫기
- pending → 버튼 disabled + "내보내는 중…", 실패 → 인라인 에러(`text-rose-600`)

### 5.7 페이지 배선 (`members/page.tsx`)

- `header` 우측에서 `managedClub.myRole === 'LEADER'` 일 때만 `<MemberCsvDownloadPopover clubId={currentClubId} clubName={managedClub.clubName} />` 렌더

### 5.8 프론트 테스트 (`apps/web/test/manage/...`)

- `membersCsv.test.ts`(단위, 핵심): 헤더/행 직렬화, 이스케이프(콤마·따옴표·개행), BOM 선행, 역할 라벨 한글 매핑, `joinedAt`→`YYYY-MM-DD`, includePhone 컬럼 토글, 파일명 생성·불가문자 치환
- 팝오버 컴포넌트 테스트: api 클라이언트 레이어 모킹(`useMutation` 자체 모킹 금지) → rows 반환 → 전화 옵션 on/off 후 `다운로드` → `membersExport` 인자·`downloadTextFile` 호출 검증
- 페이지: LEADER 만 버튼 노출

---

## 6. 에러 처리 / 엣지 케이스

- export 실패(403/네트워크) → 팝오버 인라인 에러, 다운로드 없음
- 빈 명단(이론상 회장 1명 상존) → 헤더만 있는 CSV 정상 생성
- `major`/`phone` 기본값 → 원문 출력 (`includePhone=false` 면 phone 컬럼 자체 없음)
- 이름·학과의 콤마·따옴표·개행 → RFC 4180 이스케이프

## 7. PR 계획

1. **PR 1 (backend)** — `feat(backend): 동아리 멤버 CSV용 export 조회 API` : 4.x 전부 + 테스트. `develop` 분기/PR.
2. **PR 2 (frontend)** — `feat(frontend): 멤버 관리 명단 CSV 다운로드` : 5.x 전부 + 테스트. PR 1 머지 후 착수.

각 PR 직전 self-check(스펙 준수 / Out of Scope 이탈 없음 / 테스트 통과 / 시크릿 없음 / 컨벤션·네이밍 / 변경 범위 한정) 수행.
