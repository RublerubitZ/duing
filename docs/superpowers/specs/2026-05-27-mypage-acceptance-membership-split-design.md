# 마이페이지 — 합격 후 지원→소속 자동 전환 설계

> 작성일: 2026-05-27
> 범위: Part A (Application → ClubMember 전환). Part B (가입 동아리 공지·정기모임)는 별도 spec 예정.

---

## 1. 배경 / 문제

학생 마이페이지(`/me`)는 세 개 섹션(`진행 중인 지원` / `가입한 동아리` / `찜한 동아리`)으로 구성된다.
현재 두 가지가 사용자 기대와 어긋난다.

1. **합격(ACCEPTED) 또는 불합격(REJECTED) 지원이 "진행 중인 지원"에 계속 남는다.**
   `GET /api/v1/applications/me` 가 모든 상태를 그대로 내려주고, `SectionApply` 가 ACCEPTED/REJECTED 케이스까지 step bar 4단으로 렌더링하기 때문이다.
2. **합격해서 동아리 멤버가 되어도 "가입한 동아리" 섹션에 나타나지 않는다.**
   `SectionJoined` 가 `GET /api/v1/leader/clubs/me/managed` 만 호출하는데, 이 API 는 LEADER/OFFICER 만 반환한다. MEMBER 로 합류한 동아리는 어디에도 표시되지 않는다.

백엔드 도메인 로직 자체는 정상이다 — REQUIREMENTS §1.2 에 따라 `ACCEPTED` 시 `ClubMember(MEMBER)` 자동 등록이 보장된다. 데이터는 들어가지만 **마이페이지가 그것을 읽지 않을 뿐**이다.

## 2. 목표

- 학생이 합격하면, 그 다음 마이페이지 방문 시:
  - "진행 중인 지원"에서 해당 카드가 사라진다.
  - "가입한 동아리"에 해당 동아리가 `회원` pill 과 함께 추가되어 있다.
  - 화면 상단에 1회성 합격 축하 배너가 노출된다(닫기 가능).
- "진행 중인 지원" 은 **`SUBMITTED` / `UNDER_REVIEW` / `INTERVIEW_PENDING` (active 3종)** 만 포함한다. ACCEPTED/REJECTED 는 terminal 상태로 분류해 제외한다.
- "가입한 동아리" 는 **모든 멤버십(LEADER/OFFICER/MEMBER)** 을 포함하되 role 을 시각적으로 구분한다.

## 3. 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| 사용자용 멤버십 조회 | `GET /api/v1/me/clubs` **신설**. 기존 `/leader/clubs/me/managed` 는 운영자 콘솔 전용으로 유지 |
| 지원 목록 status 필터 | `GET /api/v1/applications/me` 에 `scope` 쿼리 파라미터 추가. **기본값은 `all` (기존 호환)**. FE 에서 `scope=active` 명시 호출 |
| Terminal 상태 분류 | `ApplicationStatus.isTerminal()` / `isActive()` 헬퍼 추가. `scope` 매핑은 헬퍼 기반 |
| 합격 배너 | 프론트 localStorage 기반 ack. BE 컬럼 추가 없음 |
| 섹션 컴포넌트 | `SectionJoined` → `SectionMyClubs` 로 리네이밍. DOM id `sec-joined` 는 유지 (anchor/analytics 호환) |
| Application 도메인 모델 | 무변경. BE 변경은 신규 API 1개 + 기존 API 쿼리 파라미터 1개 + enum 헬퍼 2개. DB 마이그레이션 **없음** |

## 4. Backend 설계

### 4.1 `ApplicationStatus` 헬퍼 (도메인)

```java
public enum ApplicationStatus {
    SUBMITTED,
    UNDER_REVIEW,
    INTERVIEW_PENDING,
    ACCEPTED,
    REJECTED;

    public boolean isTerminal() {
        return this == ACCEPTED || this == REJECTED;
    }

    public boolean isActive() {
        return !isTerminal();
    }
}
```

`scope` 파라미터 매핑은 controller/service 가 `Arrays.stream(values()).filter(...)` 로 동적 분기하여 enum 추가 시 자동 반영.

### 4.2 내 지원 목록 — scope 필터 추가

**엔드포인트:** `GET /api/v1/applications/me?scope={all|active|archived}`

| scope | 포함 상태 |
|---|---|
| `all` (기본, 기존 호환) | 전체 |
| `active` | `isActive()` 만 (SUBMITTED, UNDER_REVIEW, INTERVIEW_PENDING) |
| `archived` | `isTerminal()` 만 (ACCEPTED, REJECTED) |

- DTO·응답 구조 변경 없음. 쿼리 파라미터 추가만.
- 잘못된 `scope` 값은 400.
- `ApplicationService` 에 새 메서드 추가하지 말고 기존 `findMyApplications(userId)` 를 `findMyApplications(userId, ApplicationScope scope)` 로 확장. `ApplicationScope` 는 controller layer 의 enum.
- 컨트롤러는 `scope.toStatuses()` (→ Set<ApplicationStatus>) 를 service 에 넘기고, repository 는 `findByUserIdAndStatusInAndDeletedAtIsNull(...)` 로 처리.

### 4.3 내 동아리 목록 — 신설

**엔드포인트:** `GET /api/v1/me/clubs`

**응답:** `List<MyClubResponse>` (200)

```json
[
  {
    "clubId": 12,
    "clubName": "두잉 댄스 동아리",
    "logoUrl": "https://.../logo.png",
    "myRole": "MEMBER",         // LEADER | OFFICER | MEMBER
    "activeRecruitmentCount": 1,
    "joinedAt": "2026-05-20T14:30:00Z"
  }
]
```

**조회 로직:**
- `ClubMember` 에서 `user_id = currentUser.id AND deleted_at IS NULL` 인 행 전체 join `clubs` (`status = ACTIVE`)
- `activeRecruitmentCount` 는 `Recruitment` 에서 `club_id IN (...) AND status = OPEN AND end_date >= today` count
- 정렬: `clubMember.createdAt DESC` (최근 가입이 위)

**권한:** 인증 사용자 본인만. role 무관(STUDENT/ADMIN 모두 허용).

**패키지 위치:** `domain/clubmember/` 또는 `domain/club/` 중 어느 곳에 둘지는 기존 코드 컨벤션을 따라 plan 단계에서 결정. 컨트롤러 path 는 `me` 계열로 묶기 위해 `MeClubController` 신설 권장.

**테스트 시나리오:**
- LEADER 1개 + OFFICER 1개 + MEMBER 2개 = 4건 반환
- 다른 사용자의 멤버십은 미포함
- soft-deleted ClubMember 미포함
- 동아리 status 가 `INACTIVE`/`REJECTED`/`PENDING_APPROVAL` 인 경우 제외 여부 — **포함**. 화면에서 상태 표시는 별도 결정사항. (MVP 에서는 단순화를 위해 status 무관 전체 반환)
- 정렬 순서 검증

### 4.4 변경 없는 것

- `ClubMember` 테이블 / 엔티티
- 기존 `/leader/clubs/me/managed` API (운영자 콘솔에서 계속 사용)
- Application 합격 처리 로직 (`A-4`)
- 어떤 DB 마이그레이션도 없음

## 5. Frontend 설계

### 5.1 패키지 변경

**`@duing/types`**
- `MyClubResponse` 타입 추가 (위 응답 스키마)
- 기존 `ManagedClub` 유지 (운영자 콘솔용)
- `ApplicationScope = 'all' | 'active' | 'archived'` 추가

**`@duing/api`** (`client.ts`)
- `users.myClubs(): Promise<MyClubResponse[]>` 추가 → `GET me/clubs`
- `applications.mine(scope?: ApplicationScope)` 의 시그니처 확장 (기존 호출은 인자 없이 유지 가능)

**`@duing/hooks`**
- `useMyClubsQuery()` 신설 (`['users', 'me', 'clubs']` 키)
- `useMyApplicationsQuery(scope?: ApplicationScope)` 시그니처 확장. 캐시 키에 scope 포함.
- 합격 처리 시 학생 본인 쪽 invalidation 은 현 PR 범위 밖(다른 사용자 mutation 이므로). 학생이 마이페이지 진입할 때 fresh fetch 로 충분.

### 5.2 `SectionApply`

- 호출: `useMyApplicationsQuery('active')`
- `STATUS_STEP` / `ACTION_LABEL` 에서 ACCEPTED, REJECTED 키 제거 (타입상 도달 불가)
- `statusNote()` 의 ACCEPTED/REJECTED 분기 제거
- 빈 상태 카피 유지

### 5.3 `SectionJoined` → `SectionMyClubs`

- 파일 리네이밍 + import 경로 갱신
- DOM id `sec-joined` 는 그대로 (탭 스크롤 + deep-link 호환). `data-section="joined"`, `SECTION_ID = 'joined'` 유지.
- props 타입: `myClubs: MyClubResponse[]`
- role pill 매핑

  | role | pill 라벨 | 카드 테두리 |
  |---|---|---|
  | LEADER | `✦ 동아리장` | `border-[1.5px] border-ink` (강조) |
  | OFFICER | `✦ 운영진` | `border-[1.5px] border-ink` (강조) |
  | MEMBER | `회원` | `border border-line` (기본) |

- Action 버튼

  | role | 라벨 | 링크 |
  |---|---|---|
  | LEADER / OFFICER | `관리` | `/manage?clubId={id}` (현행 유지) |
  | MEMBER | `둘러보기` | `/clubs/{id}` (Part B 에서 `/me/clubs/{id}` 로 교체 예정) |

- 빈 상태 카피: "아직 가입한 동아리가 없어요. 동아리 탐색하러 가기 →"

### 5.4 합격 배너 (마이페이지 상단)

**위치:** `MyPageHeader` 아래, `MyPageTabs` 위.

**로직:**
1. `myClubs` 중 `joinedAt` 이 가장 최근인 항목 1개를 후보로 선택
2. 후보가 존재하고 다음 두 조건 모두 만족하면 렌더:
   - `joinedAt` 이 최근 30일 이내 (지나친 과거 합격 노이즈 방지)
   - `localStorage.getItem('duing.acceptedAck.' + clubId)` 가 null
3. 닫기(X) 또는 둘러보기(`/clubs/{id}`) 누르면 `localStorage.setItem('duing.acceptedAck.' + clubId, Date.now())`
4. 컴포넌트는 client-only. `_components/AcceptanceBanner.tsx` 신설.

**카피:** `🎉 {clubName} 동아리에 합류했어요! [둘러보기] [닫기]`

**트레이드오프:**
- 다중 기기 동기화 X — 의도된 단순화
- 7일 vs 30일: 30일이 복귀 사용자 케이스에서 더 안전. ACCEPTED 처리 후 한 달 내 첫 방문이면 축하받을 수 있다.

### 5.5 `MyPage` 페이지 조립 변경

- `useManagedClubsQuery()` 호출 제거 (마이페이지에서는 사용 안 함; 운영자 콘솔에서만 사용)
- `useMyClubsQuery()` 호출 추가
- `useMyApplicationsQuery('active')` 로 호출 변경
- 탭 카운트 source 도 `myClubs.length` 로 변경
- `MyPageHeader` 의 `joinedCount` prop 은 `myClubs.length`

### 5.6 영향 받지 않는 것

- "찜한 동아리" 섹션
- `/me/applications/[applicationId]` 상세 페이지 — 모든 status 의 단건 조회는 그대로 가능
- 운영자 콘솔 `/manage` 라우트

## 6. 작업 분리 (3개 브랜치 / 3개 PR)

PR-1, PR-2, PR-3 순서로 진행. PR-1 머지 후 PR-2 시작.

### PR-1 (Backend)
- `ApplicationStatus.isTerminal()` / `isActive()` 헬퍼
- `applications/me?scope=` 파라미터 + 컨트롤러/서비스/리포지토리 변경
- `GET /api/v1/me/clubs` 신설 (controller / service / repository / DTO / Swagger)
- 테스트 추가 (양쪽 API)

### PR-2 (FE infra — types/api/hooks)
- `@duing/types` 타입 추가
- `@duing/api` 메서드 추가
- `@duing/hooks` 훅 추가/확장
- 단순 typecheck/build 가능한 상태로 정리. 실제 페이지 변경 없음.

### PR-3 (FE — 마이페이지 리워크)
- `SectionApply` 단순화
- `SectionJoined` → `SectionMyClubs` 리네이밍 + role pill / action 분기
- `AcceptanceBanner` 추가
- `MyPage` 쿼리/카운트 재배선
- 회귀 확인: 탭 스크롤·anchor·MyPageHeader 카운트

## 7. Out of Scope (후속 / Part B)

- "지난 지원" 페이지/탭 (API 는 PR-1 에서 제공되지만 UI 는 후속)
- 합격 이벤트 푸시/이메일 알림
- 합격 배너의 다기기 동기화 (서버측 `acknowledgedAt`)
- MEMBER 전용 동아리 허브 `/me/clubs/{clubId}` — Part B (공지/정기모임) 에서 다룸
- 운영자가 ACCEPTED 처리 시 학생 본인 캐시 실시간 무효화 (websocket/polling 부재)
- `MyClubResponse` 에 INACTIVE 동아리 표시/필터 UI

## 8. 미해결 / Plan 에서 확정할 것

- `MeClubController` 의 패키지/파일 위치 (기존 `domain/club` vs `domain/clubmember` 컨벤션 확인)
- `MyClubResponse` 의 응답에서 INACTIVE 동아리를 포함할지 — 본 spec 은 "포함, 화면 표기는 후속"으로 일단 결정. plan 단계에서 backend 컨벤션 재확인.
- `useManagedClubsQuery` 가 마이페이지 외에 어디서 더 호출되는지 검증 (제거 시 영향 범위)
