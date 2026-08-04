# 관리자 모집 관리(Admin Recruitment Management) 설계

총동아리연합회(ADMIN)가 전 동아리의 모집 현황을 관리하고 민원·운영 이슈에 대응하기 위한
관리자 전용 모집 콘솔. 강제 모집 마감, 자체(SELF) 모집의 지원자·지원서 열람,
외부(EXTERNAL) 모집의 가입 링크 현황 조회, 그리고 모든 관리자 행위의 감사 기록을 제공한다.

**SoT**: develop `1ccc983e` 이후 — 외부 폼 v2(#865~#873) 반영 완료 상태.
**착수 전제**: 지원 FSM 단순화(#863/#864) 머지 후 분기한다 — V103 선점, `ApplicationStatus`
enum·stats DTO 변경을 rebase 없이 흡수하기 위함. 신규 마이그레이션은 **V104부터**.

---

## 1. 도메인 전제 (코드 근거)

| 사실 | 근거 |
|---|---|
| 모집 저장 상태는 `OPEN/CLOSED` 2값, 유일 전이는 `Recruitment.close(LocalDateTime closedAt)` — 중복 마감 시 409 | `Recruitment.java:234`, `RecruitmentAlreadyClosedException` |
| `closedAt`(V101)은 가입 링크 유효기간의 기준점 — 종료 전이 경로마다 반드시 스탬프 | `Recruitment.java:230` 주석 |
| 모집 방식은 `ApplicationMode { SELF, EXTERNAL }` + `externalFormUrl`(화이트리스트 3종) | `ApplicationMode.java`, `ExternalFormUrlValidator` |
| EXTERNAL 모집은 지원 제출이 서비스 레벨 차단 — 지원 데이터가 애초에 없다 | `GeneralApplicationService.java:182` |
| 가입 코드: 발급=EXTERNAL+`isEffectivelyOpen`만, 사용=미폐기·미소진+(OPEN 계속/CLOSED는 `closedAt+joinWindowDays`), fail-closed | `GeneralJoinCodeService.create`, `ClubJoinCode.isUsable` |
| 지원서는 고정 필드 없이 폼 질문·답변 구조, 첨부파일 없음 | `ApplicationAnswer`, `ApplicantDetailQuery.buildPairedAnswers` |
| 공개용 `Recruitment.applicantCount`는 노출 토글 종속(null 위험) — 집계는 count 쿼리로 | `showApplicantCount` 연동 |
| `club_audit_event`(V102)는 범용 감사 스트림 — "도메인별 감사 테이블 신설 금지"가 명시된 설계 의도 | V102 DDL 주석 |

## 2. 백엔드 API — `/api/v1/admin/**` 5개

컨벤션: `api/Admin*Api` 인터페이스 + `controller/Admin*Controller`(`@PreAuthorize("hasRole('ADMIN')")`)
+ `service/AdminRecruitment*Service` 인터페이스 + `General*` 구현. 패키지는 각 도메인 하위
(recruitment/application) — 기존 `AdminUser*` 배치 관례.

### 2.1 `GET /admin/recruitments` — 모집 목록
- 파라미터: `q`(동아리명·제목 부분일치 OR, ignoreCase), `status`(OPEN/CLOSED, 저장 상태),
  `mode`(SELF/EXTERNAL), `sort`(`latest`=createdAt desc 기본 / `applicants`=지원자 수 desc /
  `deadline`=endDate asc **NULLS LAST**·상시모집 맨 뒤)
- 응답 항목: recruitmentId, clubId, clubName, title, applicationMode, status,
  applicantCount(**SELF만 count 쿼리, EXTERNAL은 null → FE "—"**), startDate, endDate, updatedAt
- QueryDSL — `RecruitmentRepositoryCustom` 확장. soft delete는 `@SQLRestriction` 암묵 적용.
- 페이지네이션 없음(운영진 지원자 목록 무페이징 전례) — 필요해지면 후속.

### 2.2 `GET /admin/recruitments/{recruitmentId}` — 모집 상세
- 공통: 2.1 항목 + externalFormUrl
- EXTERNAL이면 가입 링크 현황 동봉: **`JoinCodeQuery` 조립 로직 재사용**하되 admin 응답에는
  **`code` 6자리 값을 제외**하고 매핑(유출 리스크·불필요 — 5.3과 일치). 나머지 필드
  (generation·maxUses·usedCount·joinWindowDays·joinExpiresAt·totalRequestCount·pendingCount)는 그대로.
  활성 코드 없으면 null. 운영진 상태 카드(스펙 v2 7.2)와 동일 소스 — 수치 불일치 원천 차단.
- 404: 미존재/삭제 모집.

### 2.3 `PATCH /admin/recruitments/{recruitmentId}/close` — 강제 마감
- body: `{ reason?: string }` (선택, 최대 500자) → 204
- 구현: `findById → recruitment.close(LocalDateTime.now(clock))` — **기존 도메인 메서드 재사용,
  별도 UPDATE·상태 머신 우회 금지**. `closedAt` 스탬프는 시그니처가 강제.
- 409: 이미 CLOSED(`RecruitmentAlreadyClosedException` 그대로 전파).
- 같은 트랜잭션에서 감사 이벤트 `RECRUITMENT_FORCE_CLOSED` 기록(reason 포함).
- 운영진 수동 마감과 동시 경합: 둘 다 `close()` 경유라 최종 상태 동일, 한쪽 409 — 추가 잠금 불요.

### 2.4 `GET /admin/recruitments/{recruitmentId}/applications` — 지원자 목록 (SELF)
- 파라미터: `q`(이름·학번), `status`(실제 `ApplicationStatus` enum 값만), `sort`(`latest` 기본/`oldest`)
- 응답: `{ summary: { total, 상태별 카운트… }, applicants: [...] }`
  - summary는 기존 stats groupBy 쿼리(`RecruitmentStatsRepositoryImpl`) 재사용 — 별도 통계 API 없음
  - applicants 항목: applicationId, userName, studentId, college, major, status, submittedAt
    (운영진 응답의 grade·answers 미리보기·myScore는 미노출)
- **EXTERNAL 모집이면 빈 목록 200** (지원 데이터가 없다는 사실 그대로 — 에러 아님, 테스트로 정책 고정)
- 정렬 파라미터는 `ApplicationRepositoryImpl.searchApplicants`에 방향 인자 추가
  (운영진 경로 기본값 createdAt desc 유지 — 기존 호출부 무변).

### 2.5 `GET /admin/applications/{applicationId}` — 지원서 상세 (읽기 전용)
- 응답: applicant(name·studentId·college·major — **phone 제외**), submittedAt, status,
  statusHistory(previousStatus/newStatus/changedAt), answers(질문·답변 페어 —
  `buildPairedAnswers`+`formatAnswerValues` 재사용)
- **미노출**: 전화번호, 면접 평가·점수·의견, 면접 일정, 내부 메모 일체 (개인정보·내부 데이터 최소 노출)
- 같은 트랜잭션에서 감사 이벤트 `APPLICATION_VIEWED` 기록. 목록 조회는 기록하지 않는다.
- 열람마다 기록한다(dedupe 없음 — 개인정보 열람 이력 목적).

### 재사용 경계 (중요)
기존 서비스 메서드(`GeneralApplicationService.getApplicants`, `GeneralJoinCodeService.findActive` 등)는
내부에서 `clubAuthService.requireManager`를 호출하므로 admin이 직접 재사용할 수 없다.
**재사용 계층 = 리포지토리·쿼리 DTO·포맷팅 로직**(searchApplicants, stats groupBy, JoinCodeQuery 조립,
buildPairedAnswers). admin 서비스는 그 위에 얇게 얹고, 권한은 admin 아키텍처(4절)가 담당한다.

## 3. 감사 로그 — `club_audit_event` 확장 (V104)

신규 테이블을 만들지 않는다(V102 설계 의도). 마이그레이션 1건:

```sql
-- V104: 관리자 모집 조치 감사 — application 참조·사유 컬럼 추가, 이벤트 2종 등록
ALTER TABLE club_audit_event ADD COLUMN application_id BIGINT REFERENCES application (id);
ALTER TABLE club_audit_event ADD COLUMN reason VARCHAR(500);
-- event_type CHECK 갱신: DROP CONSTRAINT → 기존 6종 + RECRUITMENT_FORCE_CLOSED, APPLICATION_VIEWED 로 ADD
```

- `ClubAuditEventType`에 `RECRUITMENT_FORCE_CLOSED`, `APPLICATION_VIEWED` 추가 + `ClubAuditEvent`에
  정적 팩토리 2개(admin 조치용 — clubId·recruitmentId·actorUserId 필수, applicationId·reason 선택).
- 기록 필드: actor(=admin userId), clubId, recruitmentId, applicationId(열람 시), reason(마감 사유), createdAt.
- append-only·수정/삭제 없음·id 참조(연관관계 금지 — V102 주석의 TransientObjectException 함정) 그대로 준수.
- 향후 `FORCE_REOPEN`·`EXPORT_APPLICATIONS`·Join Request 계열 admin 조치도 같은 테이블에
  이벤트 타입 추가만으로 수용된다(CHECK 갱신 마이그레이션 동반 — V102 말미 절차 주석).

**논점 기록**: `club_audit_event` 조회 UI(운영진 타임라인)는 아직 없다. 생기면 admin의
`APPLICATION_VIEWED`가 운영진에게 노출될 수 있다 — 노출 여부는 그 시점에 결정(투명성 장점 vs 운영 노이즈).

## 4. 권한·보안

- 기존 admin 아키텍처 **그대로 재사용, 신규 계층 없음**:
  SecurityConfig URL 백스톱(`/api/v1/admin/**` hasRole ADMIN, `SecurityConfig.java:97`) +
  컨트롤러 `@PreAuthorize("hasRole('ADMIN')")` + FE `middleware.ts`(auth_hint) + `AdminRoleGuard`(fail-closed).
- 서비스 계층 별도 role 검사는 두지 않는다 — 기존 admin 컨트롤러 15개 선례와 일관,
  두 계층의 독립성은 `AdminUrlLayerAuthorizationAcceptanceTest` 패턴으로 회귀 잠금.
- IDOR: admin은 전 동아리 접근이 정당하므로 소유권 대조가 아니라 **역할 경계**가 방어선 —
  STUDENT·동아리 운영진(LEADER/OFFICER) 토큰으로 신규 5개 엔드포인트 전부 403,
  미인증 401을 엔드포인트별 테스트로 고정.
- 지원서 상세는 읽기 전용 — 상태 변경·수정 API를 만들지 않는다.

## 5. 프론트엔드

### 5.1 콘솔 진입
- `adminSections.ts`에 "모집 관리" 1항목 추가 → 사이드바·대시보드 카드 자동 반영.
- 라우트: `app/admin/recruitments/page.tsx`(얇은 서버 컴포넌트) → `_pages/AdminRecruitmentsPage.tsx`('use client')
  → `_components/*` — 기존 admin 콘솔 파일 관례.
- API 클라이언트 `client.admin.recruitments.*` + `adminQueryKeys`에 `recruitments*` 키 추가
  (list/detail/applications/applicationDetail), 훅은 `packages/hooks` 도메인 파일 분리 관례.

### 5.2 목록 화면
- 컬럼: 동아리명 / 모집 제목 / 방식 / 상태 / 지원자 수(EXTERNAL "—") / 모집 기간 / 마지막 수정일
- 검색(디바운스 — `useDebouncedValue` 재사용) + 필터 칩(상태 OPEN·CLOSED / 방식 SELF·EXTERNAL)
  + 정렬 select(최신/지원자/종료임박)
- **운영 개입 필요 배지**: `endDate < today && status === OPEN`이면 표시 — 목록 응답 필드만으로
  FE 파생 계산, API 변경 없음. 기간 경과는 보조 정보일 뿐, 강제 마감 가능 여부는 저장 상태 기준.
- 방식 라벨: `externalFormPlatform.ts` 재사용(Google Form/네이버 폼 판별), SELF는 "자체 지원".

### 5.3 상세 화면 — 방식별 완전 분리
공통 상단: 모집 메타(동아리·제목·방식·상태·기간·마지막 수정) + 강제 마감 버튼(**저장 상태 OPEN일 때만**).

**SELF** (`AdminSelfRecruitmentPanel`): 요약 카드(총 지원자 + 상태별 카운트 — 2.4 summary 재사용,
라벨은 `APPLICATION_STATUS_LABEL` 공용 상수) → 지원자 테이블(검색·상태 필터·정렬, 읽기 전용 —
체크박스·일괄 처리 없음) → 행 클릭 시 지원서 시트(`AdminUserDetailSheet` 선례) — 프로필·답변·상태 이력.

**EXTERNAL** (`AdminExternalRecruitmentPanel`): 지원자 테이블·"0명"을 렌더하지 않는다. 대신
- 정책 안내 패널: "외부 모집은 두잉에서 지원서를 관리하지 않습니다. 회원 등록은 가입 코드 → 가입 요청 →
  운영진 승인 절차로 진행됩니다." + 외부 폼 URL(플랫폼 라벨 + 링크)
- 요약 카드(읽기 전용, 2.2의 JoinCodeQuery 필드 파생):
  가입 코드 상태(활성/폐기/만료/소진·없음) · 가입 요청 수(totalRequestCount) · 승인 대기(pendingCount) ·
  **회원 등록 수 = usedCount − pendingCount** (신청 시 차감·거절 시 환급 불변식의 파생값 — 신규 집계 없음)
- 코드 6자리 값은 admin 화면에 노출하지 않는다(유출 리스크·불필요).

Application 기반 UI와 Join 기반 UI를 컴포넌트 단위로 분리해 혼재를 금지한다.

### 5.4 강제 마감 다이얼로그
- 공용 ConfirmDialog가 아닌 전용 다이얼로그(`AdminForceCloseDialog` — 기존 `Admin*ProcessDialog` 패턴):
  경고 문구 + 사유 입력(선택, 500자) + 취소/마감.
- **EXTERNAL이면 파생 효과 안내 추가**: "마감하면 새 가입 링크 발급이 불가하며, 기존 링크는 모집 종료 후
  N일까지만 유효합니다." (N = joinWindowDays)
- 성공 시 관련 쿼리 invalidate + 토스트, 409는 "이미 마감된 모집입니다" 안내 후 재조회.

## 6. 테스트

**백엔드** (TestContainers + RestAssured, `IntegrationTestBase` — `AdminUserStatusControllerTest` 패턴):
- 권한: 신규 5개 엔드포인트 × (ADMIN 성공 / STUDENT 403 / 운영진 403 / 미인증 401)
- 강제 마감: OPEN→CLOSED 204 + `closedAt` 스탬프 검증 / 중복 마감 409 / 감사 이벤트
  (RECRUITMENT_FORCE_CLOSED, actor·reason) 1건 검증 / EXTERNAL 모집 마감 후 기존 링크
  `isUsable` 유지(joinWindow 내) 확인
- 조회 정책: SELF 목록·상세·summary / EXTERNAL 지원자 목록 빈 200 / EXTERNAL 상세에 JoinCodeQuery 동봉
- 열람 감사: 상세 조회 시 APPLICATION_VIEWED(applicationId 포함) 기록, 목록 조회는 미기록
- 목록: 검색·필터·정렬(NULLS LAST 포함)·삭제 모집 제외
- 날짜는 상대값 사용(하드코딩 미래 절대날짜 금지 — CI 시한폭탄 방지)

**프론트** (`apps/web/test/admin/recruitments/` — vitest + RTL + msw):
- 방식별 UI 분기(SELF 테이블 / EXTERNAL 안내 패널 — 지원자 테이블 부재 단언)
- 요약 카드 파생값(등록 수 = usedCount − pendingCount, 코드 없음 상태)
- 강제 마감 다이얼로그(사유 입력·EXTERNAL 안내 문구·409 처리) / 운영 개입 배지 조건
- AdminRoleGuard 차단(비 ADMIN)

## 7. PR 분할·순서

`develop` 순차 스택, FSM(#863/#864) 머지 후 분기:

1. **BE-1** `feat(backend)`: admin 모집 목록·상세 조회 API (2.1, 2.2)
2. **BE-2** `feat(backend)`: 강제 마감 + V104 감사 확장 + 지원자·지원서 조회 API (2.3~2.5, 3절)
3. **FE-1** `feat(frontend)`: admin 모집 콘솔 — 목록·상세·강제 마감 (5.1~5.4 중 SELF 지원자 테이블 제외)
4. **FE-2** `feat(frontend)`: 지원자 목록·지원서 시트 (5.3 SELF 패널 완성)

## 8. Out of Scope

- 강제 모집 재개(FORCE_REOPEN) — 정책 확정 후 별도 PR
- 지원서 CSV/내보내기(EXPORT_APPLICATIONS), 전화번호 열람(VIEW_PROFILE 계열)
- admin의 가입 요청 개입(승인·거절·상세) — 읽기 전용 현황까지만, 권한 확장은 별도 논의
- Join Request 계열 admin 감사 이벤트 — 테이블 구조는 이미 수용(3절), 기능 추가 시 이벤트만 등록
- 운영진(/manage) 가입 코드 화면 개편 — v2에서 이미 모집 상세로 이전 완료, 추가 변경 없음
- admin 목록 페이지네이션, funnel/daily 수준 admin 통계
- "가입코드 생성 필요" 배지 — 발급은 진행 중 모집만 가능(#871)이라 성립하지 않음
- `club_audit_event` 조회 타임라인 UI(운영진·admin 공통) — 데이터만 쌓는다(V102 방침)
