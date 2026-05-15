# Du-ing 전체 플로우 설계 (MVP 재정의)

> 작성일: 2026-05-15
> 상태: 합의 완료, 구현 계획 작성 대기
> 적용 범위: REQUIREMENTS.md 의 MVP 4도메인을 **재정의**하여 운영진 풀워크플로우·자유 태그·활동사진·FAQ·SNS·외부 폼·면접 단계·통계 대시보드까지 포함한다. 본 문서는 REQUIREMENTS.md 를 갱신하는 단일 진실 소스가 된다.

---

## 0. 합의 요약 (Q1~Q12)

| # | 결정 |
|---|---|
| Q1 | MVP 재정의 — REQUIREMENTS 의 격차(태그·커버·SNS·FAQ·활동사진·외부폼·면접·통계·정보수정)를 전부 포함 |
| Q2 | 외부 폼은 링크 아웃 + 운영진 화면에서 "지원자 관리 비활성" 명시 |
| Q3 | 5단계 상태 (`SUBMITTED → UNDER_REVIEW → INTERVIEW_PENDING → ACCEPTED/REJECTED`) + 모집별 면접 사용 토글 |
| Q4 | 면접 알림 채널은 인앱만; 알림톡·메일은 `InterviewNotificationService` 추상화로 확장점만 마련 (MVP=Noop) |
| Q5 | 파일 저장은 Supabase Storage 1차 구현체, 로컬 fallback 유지 |
| Q6 | 운영진 멤버 관리 풀패키지: OFFICER 승급/강등·강퇴·탈퇴·회장 인계 포함 |
| Q7 | `clubs.tags text[]` 자유 태그 + 메인 페이지 `recruiting` 토글 추가 |
| Q8 | 동아리당 다중 OPEN 모집 허용 (상세 페이지에 카드 N개) |
| Q9 | `Recruitment.targetRole` (MEMBER\|OFFICER) + OFFICER 모집은 "기존 부원만 지원 가능" |
| Q10 | 활동사진은 별도 테이블, FAQ/SNS 는 JSONB (하이브리드) |
| Q11 | 통계: 카드 + 일자별 추이 + Funnel |
| Q12 | D' — 익명 탐색 허용, 지원 시점 가입/로그인 게이트, 학교 도메인 정규식 + 학번 유니크. 인증 메일·SSO 는 Phase 2 |

## 0-1. 아키텍처 접근

**Approach 1 — Spring-centric**

| 레이어 | 담당 |
|---|---|
| 인증·인가(JWT 발급/검증) | Spring Security |
| 비즈니스 로직·API | Spring Boot |
| DB(Postgres) | Supabase 호스팅 Postgres — Spring 이 JDBC 로 직접 연결 (Supabase Auth/RLS 미사용) |
| 파일 저장 | Supabase Storage — Spring 이 `FileStorageService` 어댑터로 호출 |
| 프론트(Next.js) | Spring REST API 만 호출. Supabase SDK 미사용 |

근거: 기존 백엔드 DDD 패턴·JWT 흐름과의 정합성, 학번 가입과 Supabase Auth 의 부정합, 실시간/직접 업로드는 MVP 가치 대비 비용 과대.

---

## 1. 사용자 플로우 (Persona 별)

### 1-1. 학생 플로우

```
[비로그인 상태]
  메인 페이지 (탐색)
    ├─ 카테고리 칩 / 태그 / 모집중 토글 / 키워드 검색
    ├─ 동아리 카드 그리드 (페이지네이션)
    └─ 카드 클릭
         ↓
  동아리 상세 페이지
    ├─ 소개 / 활동 / 활동사진 / FAQ / SNS 링크
    ├─ 현재 OPEN 모집 카드 N개 (다중 가능)
    └─ "지원하기" 클릭
         ↓
    ┌──────────────────────────┐
    │ 로그인/회원가입 게이트     │
    │ (학번 + 학교 도메인 메일)  │
    └──────────────────────────┘
         ↓
  [로그인 후]
  지원 화면 분기
    ├─ 자체 폼 모집 → 동적 질문 답변 → 제출
    └─ 외부 폼 모집 → "외부 폼으로 이동" 안내 + 클릭 → 외부 URL 새 탭
         ↓
  마이 페이지 (내 지원 목록)
    ├─ 모집별 상태 표시 (제출 / 서류검토 / 면접대기 / 합격 / 불합격)
    ├─ 면접대기 항목 → 운영진이 입력한 면접 일시·장소 표시
    └─ 합격 → "소속 동아리" 섹션에 자동 노출 (MEMBER)
```

**상태 자동 전이 규칙**
- `SUBMITTED` 가 초기 상태. 운영진이 검토 시작 시 `UNDER_REVIEW` 로 변경.
- 면접 미사용 모집: `UNDER_REVIEW → ACCEPTED|REJECTED` (스킵).
- 면접 사용 모집: `UNDER_REVIEW → INTERVIEW_PENDING → ACCEPTED|REJECTED`.
- `ACCEPTED` 시 `ClubMember(targetRole)` 자동 등록 (멱등).
- 역전이·임의 스킵 금지 → 400.

### 1-2. 운영진 플로우 (LEADER / OFFICER)

```
로그인
  ↓
운영 콘솔 진입 (내가 LEADER/OFFICER 인 동아리 목록)
  ├─ 동아리 선택
  └─ 콘솔 탭 5개
       ├─ ① 동아리 정보 (LEADER만 수정, OFFICER 는 읽기)
       │     - 이름·한줄소개·로고·커버·태그·SNS링크·FAQ
       │     - 활동사진 업로드/삭제/정렬
       │
       ├─ ② 모집 공고 (LEADER + OFFICER)
       │     - 공고 목록 (OPEN/CLOSED)
       │     - 신규 작성: 기간·정원·targetRole(MEMBER|OFFICER)·면접 사용 여부
       │     - 응답 수집 방식: [자체 폼 | 외부 폼 링크]
       │       └ 자체 폼: 질문 빌더 (JSONB)
       │       └ 외부 폼: URL 입력 + "이 모집은 지원자 관리 비활성" 배지
       │     - 수정 / 마감
       │
       ├─ ③ 지원자 관리 (LEADER + OFFICER)
       │     - 모집 선택 → 지원자 리스트
       │     - 상태 칼럼: 제출 / 서류검토 / 면접대기 / 합격 / 불합격
       │     - 행 클릭 → 답변 상세 모달 → 상태 변경
       │     - 면접대기 행: 면접 일시·장소 입력란 + (Phase2 알림 발송 버튼)
       │     - ⚠ 외부 폼 모집은 "외부 폼 응답을 확인하세요" 안내만 표시
       │
       ├─ ④ 통계 대시보드 (LEADER + OFFICER)
       │     - 모집 선택
       │     - 카드: 전체 / 검토중 / 면접대기 / 합격 / 불합격
       │     - 차트: 일자별 지원 추이 (라인)
       │     - 차트: Funnel (제출 → 서류통과 → 면접 → 합격)
       │
       └─ ⑤ 멤버 관리 (LEADER 만)
             - 멤버 목록 (역할별 그룹: LEADER/OFFICER/MEMBER)
             - OFFICER 모집 공고 작성 시 "기존 MEMBER 만 지원 가능" 제약
             - 액션: MEMBER↔OFFICER 승급/강등, 강퇴, 회장 인계(LEADER 위임)
             - 본인: 탈퇴 (LEADER 는 인계 후에만 탈퇴 가능)
```

### 1-3. 총동연(ADMIN) 플로우

```
로그인 (ADMIN role)
  ↓
관리자 콘솔
  ├─ 동아리 신청 대기 목록 (status=PENDING_APPROVAL)
  │   └─ 승인(ACTIVE) / 반려(INACTIVE)
  ├─ 동아리 신규 등록
  │   - name / category / division / leaderId 지정
  │   - 생성 즉시 LEADER 자동 ClubMember 등록
  └─ 동아리 상태 변경 (ACTIVE ↔ INACTIVE)
```

ADMIN 승급 자체는 운영자가 DB 수동 처리 (별도 admin API 미구현 — REQUIREMENTS 명세 유지).

---

## 2. 데이터 모델

### 2-1. 엔티티 변경 요약

| 엔티티 | 상태 | 변경 |
|---|---|---|
| `User` | 유지 | 컬럼 변경 없음. 검증 강화: `email` 정규식 `^[A-Za-z0-9._%+-]+@(.+\.)?daegu\.ac\.kr$` |
| `Club` | 확장 | `coverUrl`, `tags text[]`, `snsLinks jsonb`, `faqs jsonb` 추가 |
| `ClubPhoto` | **신규** | 활동사진 별도 테이블 |
| `ClubMember` | 유지 | 변경 없음 |
| `Recruitment` | 확장 | `applicationMode`, `externalFormUrl`, `useInterview`, `targetRole` 추가 |
| `RecruitmentForm` | 유지 | 외부 폼 모집은 행 미생성 (1:0..1) |
| `Application` | 확장 | 상태 enum 5개 + `interviewAt`, `interviewLocation` |

### 2-2. 엔티티 상세

**User**
```
id              bigint PK
studentId       varchar(10)  unique  not null     [7~10자리 숫자]
name            varchar(50)  not null
email           varchar(254) unique  not null     [@*.daegu.ac.kr 정규식]
passwordHash    varchar(72)  not null             [BCrypt]
role            enum(STUDENT|ADMIN) not null default 'STUDENT'
+ BaseEntity
```

**Club**
```
id              bigint PK
name            varchar(100) unique not null
category        enum(ACADEMIC|CULTURE|ART|SPORTS|VOLUNTEER|RELIGION|HOBBY|OTHER)
division        varchar(50)
description     text
logoUrl         varchar(500)
coverUrl        varchar(500)        ← NEW
tags            text[] default '{}' ← NEW
snsLinks        jsonb  default '[]' ← NEW   [{platform, url}]
faqs            jsonb  default '[]' ← NEW   [{question, answer, order}]
status          enum(PENDING_APPROVAL|ACTIVE|INACTIVE)
+ BaseEntity

INDEX gin(tags)
INDEX gin(to_tsvector('simple', name||' '||coalesce(description,'')))   (또는 ILIKE 인덱스)
```

**ClubPhoto (신규)**
```
id              bigint PK
clubId          bigint FK → clubs.id (CASCADE)
storageKey      varchar(500) not null
caption         varchar(200)
width           int
height          int
displayOrder    int default 0
+ BaseEntity

INDEX (clubId, displayOrder)
```

**ClubMember (변경 없음)**
```
id              bigint PK
clubId          bigint FK
userId          bigint FK
role            enum(LEADER|OFFICER|MEMBER)
+ BaseEntity

UNIQUE (clubId, userId) WHERE deleted_at IS NULL
INDEX (userId)
```

**Recruitment**
```
id              bigint PK
clubId          bigint FK
title           varchar(150) not null
content         text
startDate       date not null
endDate         date not null               CHECK (endDate >= startDate)
capacity        int  not null               CHECK (capacity > 0)
applicationMode enum(SELF|EXTERNAL) not null default 'SELF'  ← NEW
externalFormUrl varchar(500)                ← NEW
useInterview    boolean not null default false ← NEW
targetRole      enum(MEMBER|OFFICER) not null default 'MEMBER' ← NEW
status          enum(OPEN|CLOSED) not null default 'OPEN'
+ BaseEntity

CHECK (applicationMode='SELF' OR externalFormUrl IS NOT NULL)
INDEX (clubId, status)
INDEX (startDate, endDate)
```

**RecruitmentForm (변경 없음)**
```
id              bigint PK
recruitmentId   bigint FK UNIQUE
questions       jsonb not null     [[{id, type, label, required, options?}]]
+ BaseEntity
```
`applicationMode=EXTERNAL` 모집은 RecruitmentForm 행을 만들지 않는다.

**Application**
```
id                  bigint PK
recruitmentId       bigint FK
userId              bigint FK
answers             jsonb not null      [[{questionId, value}]]
status              enum(SUBMITTED|UNDER_REVIEW|INTERVIEW_PENDING|ACCEPTED|REJECTED)
interviewAt         timestamp           ← NEW
interviewLocation   varchar(200)        ← NEW
+ BaseEntity

UNIQUE (recruitmentId, userId) WHERE deleted_at IS NULL
INDEX (userId, status)
INDEX (recruitmentId, status)
```

### 2-3. 신규 추상화 인터페이스

```java
// global/notification/
public interface InterviewNotificationService {
    void notifyInterviewScheduled(Application application, LocalDateTime at, String location);
}

// MVP 구현체: NoopInterviewNotificationService (로그만)
// Phase 2: MailInterviewNotificationService, KakaoAlimTalkInterviewNotificationService
```

`FileStorageService` 패턴과 동일. Controller/Service 는 인터페이스로만 주입.

### 2-4. Flyway 마이그레이션 (모두 신규)

```
V{n+1}__alter_clubs_add_cover_tags_sns_faqs.sql
V{n+2}__create_club_photos.sql
V{n+3}__alter_recruitments_add_mode_target_interview.sql
V{n+4}__alter_applications_extend_status_add_interview.sql
   ├─ status enum 확장 (PostgreSQL ALTER TYPE ADD VALUE)
   └─ 기존 SUBMITTED/ACCEPTED/REJECTED 행 유지
```

`ALTER TYPE ADD VALUE` 는 트랜잭션 외부에서 실행돼야 함 — Flyway 헤더(`-- script_executes_outside_transaction`) 또는 `BEGIN/COMMIT` 분리.

---

## 3. API 엔드포인트 매핑

기준: `/api/v1` 프리픽스, JWT Bearer 필요 시 🔒, 권한은 `[역할]` 로 표기. ✅ 기존 명세, ➕ 신규/확장.

### 3-1. Auth & User

| | Method | Path | 권한 | 비고 |
|---|---|---|---|---|
|✅U-1| POST | `/api/v1/users` | 공개 | 회원가입 (학교 도메인 정규식) |
|✅U-2| POST | `/auth/login` | 공개 | JWT 발급 |
|✅U-3| GET | `/api/v1/users/me` | 🔒 | 내 정보 |
|➕| PATCH | `/api/v1/users/me` | 🔒 | 이름·비밀번호 변경 |

### 3-2. Club

| | Method | Path | 권한 | 비고 |
|---|---|---|---|---|
|✅C-1| GET | `/api/v1/clubs` | 공개 | `category, division, tags, recruiting, keyword, Pageable` |
|✅C-2| GET | `/api/v1/clubs/{clubId}` | 공개 | 상세(사진·FAQ·SNS 포함) |
|✅C-3| POST | `/admin/clubs` | 🔒 ADMIN | 동아리 생성 |
|✅C-4| PATCH | `/admin/clubs/{clubId}/status` | 🔒 ADMIN | 상태 변경 |
|➕| PATCH | `/api/v1/clubs/{clubId}` | 🔒 LEADER | 정보 수정 |
|➕| GET | `/api/v1/clubs/me/managed` | 🔒 LEADER/OFFICER | 내가 운영하는 동아리 |

### 3-3. Club Photos

| | Method | Path | 권한 |
|---|---|---|---|
|➕| GET | `/api/v1/clubs/{clubId}/photos` | 공개 |
|➕| POST | `/api/v1/clubs/{clubId}/photos` | 🔒 LEADER/OFFICER |
|➕| PATCH | `/api/v1/clubs/{clubId}/photos/{photoId}` | 🔒 LEADER/OFFICER |
|➕| DELETE | `/api/v1/clubs/{clubId}/photos/{photoId}` | 🔒 LEADER/OFFICER |

### 3-4. ClubMember

| | Method | Path | 권한 |
|---|---|---|---|
|➕| GET | `/api/v1/clubs/{clubId}/members` | 🔒 LEADER/OFFICER |
|➕| PATCH | `.../members/{memberId}/role` | 🔒 LEADER |
|➕| DELETE | `.../members/{memberId}` | 🔒 LEADER |
|➕| DELETE | `.../members/me` | 🔒 본인 (LEADER 는 거부) |
|➕| POST | `.../members/{memberId}/transfer-leader` | 🔒 LEADER (원자적) |

### 3-5. Recruitment

| | Method | Path | 권한 |
|---|---|---|---|
|✅R-1| GET | `/api/v1/recruitments/calendar?yearMonth=` | 공개 |
|✅R-2| GET | `/api/v1/recruitments/{id}` | 공개 |
|✅R-3| POST | `/api/v1/clubs/{clubId}/recruitments` | 🔒 LEADER/OFFICER |
|➕| PATCH | `/api/v1/recruitments/{id}` | 🔒 LEADER/OFFICER |
|➕| PATCH | `/api/v1/recruitments/{id}/close` | 🔒 LEADER/OFFICER |
|➕| GET | `/api/v1/clubs/{clubId}/recruitments` | 공개 |

검증: `targetRole=OFFICER` && `applicationMode=SELF` 인 모집은 지원 시점에 "지원자가 해당 동아리 기존 MEMBER 인지" 확인.

### 3-6. Application

| | Method | Path | 권한 |
|---|---|---|---|
|✅A-1| POST | `/api/v1/recruitments/{id}/applications` | 🔒 STUDENT |
|✅A-2| GET | `/api/v1/applications/me` | 🔒 STUDENT |
|➕| GET | `/api/v1/applications/me/{id}` | 🔒 본인 |
|✅A-3| GET | `/api/v1/recruitments/{id}/applications` | 🔒 LEADER/OFFICER |
|✅A-4| PATCH | `/api/v1/applications/{id}/status` | 🔒 LEADER/OFFICER |
|➕| PATCH | `/api/v1/applications/{id}/interview` | 🔒 LEADER/OFFICER (status=INTERVIEW_PENDING 인 경우만; `InterviewNotificationService` 호출) |
|➕| GET | `/api/v1/applications/{id}` | 🔒 LEADER/OFFICER |

### 3-7. Stats

| | Method | Path | 응답 |
|---|---|---|---|
|➕| GET | `/api/v1/recruitments/{id}/stats/summary` | `{total, submitted, underReview, interviewPending, accepted, rejected}` |
|➕| GET | `/api/v1/recruitments/{id}/stats/daily` | `[{date, count}]` |
|➕| GET | `/api/v1/recruitments/{id}/stats/funnel` | `{submitted, passedDocument, interviewed, accepted}` |

### 3-8. File

| | Method | Path | 권한 | 비고 |
|---|---|---|---|---|
|➕| POST | `/api/v1/files` | 🔒 | multipart, `purpose=logo\|cover\|photo`. 응답: `{storageKey, url}` |

### 3-9. 응답·상태 표준 (기존 유지)
- `{ ok, data, message }` 래핑 / 목록은 `PageResponse<T>`
- GET 200 / POST 201 / PATCH·DELETE 204 / 400 / 401 / 403 / 404 / 409

### 3-10. 권한 헬퍼

```java
ClubAuthService
  - requireLeader(userId, clubId)
  - requireManager(userId, clubId)   // LEADER ∪ OFFICER
  - requireMember(userId, clubId)    // OFFICER 모집 지원 검증
  - requireAdmin(userId)             // user.role == ADMIN
```

---

## 4. 권한 매트릭스

### 4-1. 동아리

| 동작 | 비로그인 | STUDENT | MEMBER | OFFICER | LEADER | ADMIN |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| 목록·검색 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 상세 열람 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 신규 등록 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 상태 변경 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 정보 수정 | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 활동사진 업로드/삭제 | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |

### 4-2. 모집

| 동작 | 비로그인 | STUDENT | MEMBER | OFFICER | LEADER |
|---|:-:|:-:|:-:|:-:|:-:|
| 달력·상세 열람 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 생성·수정·마감 | ❌ | ❌ | ❌ | ✅(해당 동아리) | ✅(해당 동아리) |

### 4-3. 지원

| 동작 | 비로그인 | STUDENT | MEMBER | OFFICER | LEADER |
|---|:-:|:-:|:-:|:-:|:-:|
| 지원 제출 (MEMBER 모집) | ❌ | ✅ | ✅ | ✅ | ✅ |
| 지원 제출 (OFFICER 모집) | ❌ | ❌ | ⚠ 해당 동아리 MEMBER 만 | ⚠ | ❌(이미 LEADER) |
| 내 지원 목록 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 지원자 관리·상태 변경·면접 입력 | ❌ | ❌ | ❌ | ✅(해당 동아리) | ✅(해당 동아리) |
| 통계 대시보드 | ❌ | ❌ | ❌ | ✅(해당 동아리) | ✅(해당 동아리) |

### 4-4. 멤버 관리

| 동작 | OFFICER | LEADER | 비고 |
|---|:-:|:-:|---|
| 멤버 목록 조회 | ✅ | ✅ | 해당 동아리 |
| 역할 승급/강등 | ❌ | ✅ | LEADER 만 |
| 강퇴 | ❌ | ✅ | LEADER 만 |
| 본인 탈퇴 | ✅ | ⚠ 인계 선행 시 | |
| 회장 인계 | ❌ | ✅ | 원자적 |

구현 원칙: 모든 권한 검증은 `ClubAuthService` 단일 진입점. Controller 는 `@PreAuthorize` 또는 service 첫 줄에서 호출 → 위반 시 즉시 403.

---

## 5. 프론트 라우트 (Next.js App Router)

```
app/
├─ (public)/                          ← 비로그인 가능
│  ├─ page.tsx                        메인 (탐색·검색·필터·그리드)
│  ├─ clubs/[clubId]/
│  │   ├─ page.tsx                    동아리 상세
│  │   └─ recruitments/[recruitmentId]/page.tsx   모집 상세 + 지원하기
│  └─ calendar/page.tsx               월별 모집 달력
│
├─ (auth)/
│  ├─ login/page.tsx
│  └─ signup/page.tsx                 학번 + 학교 이메일
│
├─ (student)/                         ← 🔒 STUDENT 이상
│  ├─ apply/[recruitmentId]/page.tsx  지원서 작성 (외부 폼이면 redirect)
│  └─ me/
│      ├─ page.tsx                    프로필
│      ├─ applications/
│      │   ├─ page.tsx                내 지원 목록
│      │   └─ [applicationId]/page.tsx
│      └─ clubs/page.tsx              내 소속 동아리
│
├─ (manage)/                          ← 🔒 LEADER/OFFICER
│  └─ clubs/[clubId]/
│      ├─ layout.tsx                  사이드바 + 진입 가드
│      ├─ page.tsx                    ① 정보 수정 (LEADER 전용 수정)
│      ├─ photos/page.tsx             ① 활동사진
│      ├─ recruitments/
│      │   ├─ page.tsx                ② 공고 리스트
│      │   ├─ new/page.tsx            ② 신규 작성
│      │   └─ [recruitmentId]/
│      │       ├─ page.tsx            ② 상세/수정
│      │       ├─ applicants/page.tsx ③ 지원자 관리
│      │       └─ stats/page.tsx      ④ 통계
│      └─ members/page.tsx            ⑤ 멤버 관리
│
└─ (admin)/                           ← 🔒 ADMIN
   └─ clubs/
       ├─ page.tsx
       ├─ new/page.tsx
       └─ [clubId]/page.tsx
```

### 5-1. 라우트 가드

| 그룹 | 미들웨어 | 실패 |
|---|---|---|
| `(public)` | 없음 | — |
| `(auth)` | 이미 로그인이면 `/me` 로 |
| `(student)` | JWT 필수 | `/login?next=...` |
| `(manage)/clubs/[clubId]` | JWT + 해당 동아리 LEADER/OFFICER | 403 |
| `(admin)` | JWT + `role=ADMIN` | 403 |

### 5-2. "지원하기" 게이트 흐름

```
모집 상세 → 지원하기 클릭
  ├─ applicationMode=EXTERNAL → 새 탭으로 externalFormUrl
  └─ applicationMode=SELF
       ├─ 로그인 X → /login?next=/apply/{recruitmentId}
       └─ 로그인 O
            ├─ targetRole=OFFICER && 본인이 해당 동아리 MEMBER 아님 → 안내 모달
            └─ /apply/{recruitmentId}
```

---

## 6. 단계별 빌드 순서

원칙
- Persona별 vertical slice
- 백엔드: API 1개 = 브랜치 1개 = PR 1개
- 프론트: 페이지/콘솔 탭 단위 PR
- 의존: Flyway → API → 프론트

### Phase 0 — 토대

| # | 작업 | 영역 |
|---|---|---|
| 0.1 | Flyway: `clubs` 컬럼 확장 + GIN 인덱스 | BE |
| 0.2 | Flyway: `club_photos` 생성 | BE |
| 0.3 | Flyway: `recruitments` 컬럼 확장 + CHECK | BE |
| 0.4 | Flyway: `applications.status` enum 확장 + 면접 필드 | BE |
| 0.5 | `User.email` 학교 도메인 검증 정규식 | BE |
| 0.6 | `SupabaseStorageFileStorageService` + `POST /api/v1/files` | BE |
| 0.7 | `InterviewNotificationService` + `Noop` 구현 | BE |
| 0.8 | `ClubAuthService` 헬퍼 통합 | BE |
| 0.9 | 인증 컨텍스트 + `middleware.ts` 라우트 가드 | FE |

Done: 마이그레이션 적용 후 기존 회귀 통과. 파일 업로드 라운드트립.

### Phase 1 — 학생 탐색·지원

Backend
| # | API |
|---|---|
| 1.1 | GET `/api/v1/clubs` 확장 (`tags`, `recruiting` 필터) |
| 1.2 | GET `/api/v1/clubs/{id}` 확장 (photos/faqs/sns 포함) |
| 1.3 | GET `/api/v1/clubs/{id}/photos` |
| 1.4 | GET `/api/v1/clubs/{id}/recruitments` |
| 1.5 | POST `/api/v1/recruitments/{id}/applications` (A-1) — 자체/외부 가드, OFFICER 모집 멤버십 가드 |
| 1.6 | GET `/api/v1/applications/me` (A-2) |
| 1.7 | GET `/api/v1/applications/me/{id}` |

Frontend
| # | 페이지 |
|---|---|
| 1.A | 메인 |
| 1.B | 달력 |
| 1.C | 동아리 상세 |
| 1.D | 모집 상세 + 지원하기 분기 |
| 1.E | 로그인/회원가입 |
| 1.F | 지원서 작성 (자체 폼) |
| 1.G | 내 지원 목록·상세 |

Done: 비로그인 탐색 → 가입/로그인 → 지원 제출 → 마이 페이지 상태 확인 end-to-end.

### Phase 2 — 운영진: 모집·지원자·면접·통계

Backend
| # | API |
|---|---|
| 2.1 | POST `/api/v1/clubs/{clubId}/recruitments` 확장 |
| 2.2 | PATCH `/api/v1/recruitments/{id}` |
| 2.3 | PATCH `/api/v1/recruitments/{id}/close` |
| 2.4 | GET `/api/v1/recruitments/{id}/applications` (A-3) |
| 2.5 | GET `/api/v1/applications/{id}` |
| 2.6 | PATCH `/api/v1/applications/{id}/status` (A-4, 5단계 전이 + ACCEPTED→ClubMember 멱등) |
| 2.7 | PATCH `/api/v1/applications/{id}/interview` |
| 2.8 | GET `/api/v1/recruitments/{id}/stats/summary` |
| 2.9 | GET `/api/v1/recruitments/{id}/stats/daily` |
| 2.10 | GET `/api/v1/recruitments/{id}/stats/funnel` |
| 2.11 | GET `/api/v1/clubs/me/managed` |

Frontend
| # | 페이지 |
|---|---|
| 2.A | `(manage)` 레이아웃·진입 가드 |
| 2.B | 모집 리스트/신규/상세·수정 |
| 2.C | 지원자 관리 (상태 변경·면접 입력 모달) |
| 2.D | 통계 (카드 + 라인 + funnel) |

Done: 운영진 모집 작성 → 학생 지원 → 검토·면접 → 합격 → 자동 ClubMember 사이클 end-to-end.

### Phase 3 — 운영진: 정보·사진·멤버

Backend
| # | API |
|---|---|
| 3.1 | PATCH `/api/v1/clubs/{clubId}` (LEADER) |
| 3.2 | Club Photos CRUD |
| 3.3 | GET `/api/v1/clubs/{clubId}/members` |
| 3.4 | PATCH `.../members/{memberId}/role` |
| 3.5 | DELETE `.../members/{memberId}` |
| 3.6 | DELETE `.../members/me` (LEADER 거부) |
| 3.7 | POST `.../members/{memberId}/transfer-leader` (원자적) |

Frontend
| # | 페이지 |
|---|---|
| 3.A | 동아리 정보 수정 |
| 3.B | 활동사진 |
| 3.C | 멤버 관리 |

### Phase 4 — 총동연 ADMIN

Backend
| # | API |
|---|---|
| 4.1 | POST `/admin/clubs` (C-3) |
| 4.2 | PATCH `/admin/clubs/{clubId}/status` (C-4) |

Frontend
| # | 페이지 |
|---|---|
| 4.A | 동아리 목록 (PENDING/ACTIVE/INACTIVE) |
| 4.B | 신규 등록 |
| 4.C | 상태 변경 |

### Phase 5 — Out of MVP

- 면접 알림 채널 실제 구현 (Mail/KakaoAlimTalk)
- 이메일 인증 메일
- 학과 분포 통계 (User 학과 필드)
- Supabase Realtime
- 대구대 SSO
- S3 마이그레이션
- 활동 피드

### 추정 워크로드

| Phase | BE PR | FE PR |
|---|---|---|
| 0 | 9 | 1 |
| 1 | 7 | 7 |
| 2 | 11 | 4 |
| 3 | 7 | 3 |
| 4 | 2 | 3 |
| **합계** | **36** | **18** |

---

## 7. REQUIREMENTS.md 와의 차이 (요약)

| 영역 | REQUIREMENTS | 본 설계 |
|---|---|---|
| Club 필드 | logoUrl 만 | + coverUrl, tags, snsLinks, faqs |
| Club Photos | 없음 | 별도 테이블 |
| 동아리 정보 수정 API | 없음 | LEADER 가능 |
| Recruitment 외부 폼 | 없음 | applicationMode + externalFormUrl |
| Recruitment 면접 토글 | 없음 | useInterview |
| Recruitment targetRole | 없음 | MEMBER\|OFFICER + OFFICER 모집 멤버십 가드 |
| Application status | 3단계 | 5단계 |
| 면접 일정 필드 | 없음 | interviewAt, interviewLocation |
| 통계 | 없음 | summary/daily/funnel |
| 멤버 관리 | MVP 이후 | MVP 포함 (승급·강등·강퇴·탈퇴·인계) |
| 회원가입 이메일 검증 | 자유 | 학교 도메인 정규식 |
| Storage | 로컬 | Supabase Storage 1차 + 로컬 fallback |

REQUIREMENTS.md 갱신은 Phase 0 마이그레이션 머지와 함께 별도 PR 로 진행.
