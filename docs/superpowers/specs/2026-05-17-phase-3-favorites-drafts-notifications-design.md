# Phase 3 — 학생 사용자 흐름 보강 (찜·임시저장·알림) 설계 문서

> 작성: 2026-05-17
> 범위: 학생(STUDENT) 사용자 흐름의 3개 기능 묶음
> - 찜한 동아리 모아보기
> - 지원서 자동 임시저장
> - 마감 임박 / 모집 시작 / 면접 일정 알림 (인-앱)
>
> "동아리 정보(상세 페이지 보강)"은 별도 spec 으로 미룬다.

---

## 1. 목적·성공 기준

학생이 관심 동아리를 잃지 않고, 작성 중 지원서를 잃지 않으며, 모집·면접 일정을 놓치지 않게 한다.

- 학생은 `/clubs` 목록과 동아리 상세에서 하트 한 번으로 찜 토글이 가능하다.
- 찜한 동아리의 진행 중 모집이 D-3 / D-1 / D-0 가 되면 인-앱 알림이 도착한다.
- 찜한 동아리에 새 모집이 시작되면(`startDate` 도달) 인-앱 알림이 도착한다.
- 운영진이 면접 일정을 잡거나 변경하면 지원자에게 즉시 알림이 가고, 면접 24시간 전 리마인더가 한 번 더 간다.
- 자체 폼(`applicationMode = SELF`) 지원서 작성 중 입력이 멈춘 뒤 2초마다 서버에 자동 저장되며, 다른 기기에서도 이어 쓸 수 있다.

---

## 2. 도메인 구조

기존 DDD 컨벤션(`api/controller/service/entity/repository/exception` 분리)을 그대로 따른다.

```
backend/src/main/java/com/duing/domain/
  favorite/                      NEW
    entity/ClubFavorite.java
    repository/ClubFavoriteRepository.java (+ Custom)
    service/ClubFavoriteService.java + GeneralClubFavoriteService
    controller/FavoriteController.java
    controller/dto/response/FavoriteClubResponse.java
    exception/FavoriteDomainException.java   (AlreadyFavorited, NotFavorited)

  draft/                         NEW
    entity/ApplicationDraft.java
    repository/ApplicationDraftRepository.java
    service/ApplicationDraftService.java + GeneralApplicationDraftService
    controller/ApplicationDraftController.java
    controller/dto/request/UpsertDraftRequest.java
    controller/dto/response/DraftResponse.java
    exception/DraftDomainException.java       (RecruitmentClosedForDraft)

  notification/                  NEW
    entity/Notification.java
    entity/NotificationType.java enum (RECRUITMENT_OPENED, RECRUITMENT_DEADLINE, INTERVIEW_SCHEDULED, INTERVIEW_REMINDER)
    repository/NotificationRepository.java (+ Custom)
    service/NotificationService.java + GeneralNotificationService
    controller/NotificationController.java
    controller/dto/response/NotificationResponse.java
    job/DeadlineNotificationJob.java          @Scheduled cron "0 0 6 * * *" Asia/Seoul
    job/InterviewReminderJob.java             @Scheduled cron "0 0 * * * *"
    listener/InterviewScheduledListener.java  @TransactionalEventListener(AFTER_COMMIT)
    listener/RecruitmentOpenedListener.java   @TransactionalEventListener(AFTER_COMMIT)

  application/
    service/GeneralApplicationService.java    MOD  submit() 트랜잭션 안에서 draftService.discard()
  recruitment/
    service/GeneralRecruitmentService.java    MOD  create()에서 startDate<=today면 RecruitmentOpenedEvent 발행
```

도메인 이벤트로 디커플링한다. Application·Recruitment 도메인은 Notification 을 모르고, Notification 은 application·recruitment 의 변경 흐름에 직접 끼어들지 않는다.

---

## 3. 데이터 모델 (Flyway)

기존 V1~V13 다음. 기존 파일 수정 금지.

```
backend/src/main/resources/db/migration/
  V14__create_club_favorite.sql
  V15__create_application_draft.sql
  V16__create_notification.sql
  V17__index_notification_lookup.sql
```

### V14 — club_favorite

```sql
CREATE TABLE club_favorite (
  id         BIGSERIAL    PRIMARY KEY,
  user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id    BIGINT       NOT NULL REFERENCES club(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_club_favorite UNIQUE (user_id, club_id)
);
CREATE INDEX idx_club_favorite_user_created ON club_favorite (user_id, created_at DESC);
CREATE INDEX idx_club_favorite_club         ON club_favorite (club_id); -- 잡 스캔용
```

`BaseEntity` 미상속 (soft-delete 의미 없음). hard delete.

### V15 — application_draft

```sql
CREATE TABLE application_draft (
  id             BIGSERIAL    PRIMARY KEY,
  user_id        BIGINT       NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  recruitment_id BIGINT       NOT NULL REFERENCES recruitment(id) ON DELETE CASCADE,
  answers        JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_application_draft UNIQUE (user_id, recruitment_id)
);
CREATE INDEX idx_application_draft_recruitment ON application_draft (recruitment_id);
```

`answers` 는 Application 의 `answers` 와 동일 형태 `[{questionId, value}, ...]` — 제출 승격 시 그대로 옮긴다. soft-delete 없음.

### V16 — notification

```sql
CREATE TABLE notification (
  id         BIGSERIAL    PRIMARY KEY,
  user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(40)  NOT NULL,
  title      VARCHAR(120) NOT NULL,
  body       VARCHAR(300) NOT NULL,
  link_url   VARCHAR(300),
  payload    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  dedup_key  VARCHAR(160) NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_notification_dedup UNIQUE (user_id, dedup_key)
);
```

`dedup_key` 규약:

| Type | dedup_key |
|---|---|
| `RECRUITMENT_OPENED` | `RECRUITMENT_OPENED:r={recruitmentId}` |
| `RECRUITMENT_DEADLINE` | `RECRUITMENT_DEADLINE:r={recruitmentId}:d={3\|1\|0}` |
| `INTERVIEW_SCHEDULED` | `INTERVIEW_SCHEDULED:a={applicationId}:t={ISO interviewAt}` |
| `INTERVIEW_REMINDER` | `INTERVIEW_REMINDER:a={applicationId}:t={ISO interviewAt}` |

`interviewAt` 변경 시 새 dedup_key 라 새 알림이 생기고, 기존 알림의 readAt 은 그대로 둔다(이력 보존).

### V17 — notification 인덱스

```sql
CREATE INDEX idx_notification_user_created
  ON notification (user_id, created_at DESC);

CREATE INDEX idx_notification_user_unread
  ON notification (user_id) WHERE read_at IS NULL;
```

---

## 4. REST API

모두 `Authorization: Bearer <JWT>` 필수. 응답은 기존 `ApiResponse<T>` / `PageResponse<T>` 래핑.

### 4.1 찜 (Favorite)

| Method | Path | Body | Auth | 응답 | 예외 |
|---|---|---|---|---|---|
| `POST` | `/api/v1/me/favorites/{clubId}` | — | STUDENT+ | `201 { favoriteId }` | 동아리 404, 이미 찜 409 |
| `DELETE` | `/api/v1/me/favorites/{clubId}` | — | STUDENT+ | `204` (멱등 — 없어도 204) | — |
| `GET` | `/api/v1/me/favorites` | `?page&size&sort` | STUDENT+ | `200 PageResponse<FavoriteClubResponse>` | — |
| `GET` | `/api/v1/me/favorites/ids` | — | STUDENT+ | `200 { clubIds: number[] }` | 목록 페이지 하트 채우기 경량 endpoint |

`FavoriteClubResponse` = `clubId, name, logoUrl, category, division, favoritedAt, openRecruitmentCount`.

### 4.2 임시저장 (Draft)

| Method | Path | Body | Auth | 응답 | 예외 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/recruitments/{recruitmentId}/draft` | — | STUDENT+ | `200 DraftResponse` 또는 `{ exists: false }` | 모집 404 |
| `PUT` | `/api/v1/recruitments/{recruitmentId}/draft` | `{ answers: [...] }` | STUDENT+ | `204` (upsert) | 모집 404, 마감/종료 410, 답변 길이 불일치 400 |
| `DELETE` | `/api/v1/recruitments/{recruitmentId}/draft` | — | STUDENT+ | `204` (멱등) | — |

draft 의 `answers` 는 부분 입력 허용 — 길이만 검증, required/빈 값 검증은 제출 시점에만. 제출은 기존 `POST /api/v1/recruitments/{id}/applications` 그대로이며, 핸들러 트랜잭션 내부에서 `draftService.discard(userId, recruitmentId)` 호출.

### 4.3 알림 (Notification)

| Method | Path | Body | Auth | 응답 | 예외 |
|---|---|---|---|---|---|
| `GET` | `/api/v1/me/notifications` | `?page&size&unreadOnly?` | 로그인 | `200 PageResponse<NotificationResponse>` (`created_at DESC`) | — |
| `GET` | `/api/v1/me/notifications/unread-count` | — | 로그인 | `200 { count: number }` | — |
| `PATCH` | `/api/v1/me/notifications/{id}/read` | — | 로그인 | `204` (멱등) | 본인 아님 403, 없음 404 |
| `PATCH` | `/api/v1/me/notifications/read-all` | — | 로그인 | `204` | — |

`NotificationResponse` = `id, type, title, body, linkUrl, readAt, createdAt`. `payload` 는 응답에 포함하지 않는다(내부용).

`linkUrl` 규약:

| Type | linkUrl |
|---|---|
| `RECRUITMENT_OPENED`, `RECRUITMENT_DEADLINE` | `/clubs/{clubId}/recruitments/{recruitmentId}` |
| `INTERVIEW_SCHEDULED`, `INTERVIEW_REMINDER` | `/applications/{applicationId}` |

---

## 5. 알림 발행 로직

### 5.1 즉시 발행 (도메인 이벤트, AFTER_COMMIT)

| 이벤트 | 발행 지점 | 구독 결과 |
|---|---|---|
| `RecruitmentOpenedEvent(recruitmentId, clubId)` | `RecruitmentService.create()` 에서 `status=OPEN AND startDate<=today` 일 때 | 해당 club 을 찜한 모든 유저에게 `RECRUITMENT_OPENED` 멱등 INSERT |
| `InterviewScheduledEvent(applicationId, interviewAt)` | `LeaderApplicationService.updateInterview()` | 해당 지원자에게 `INTERVIEW_SCHEDULED` 멱등 INSERT |

MVP 에는 모집 reopen API 가 없으므로 `CLOSED → OPEN` 전환 경로는 다루지 않는다. 추후 그런 경로가 생기면 동일 이벤트를 발행한다.

### 5.2 스케줄러

**`DeadlineNotificationJob`** — `cron = "0 0 6 * * *"` Asia/Seoul. 하루 한 번. `RECRUITMENT_OPENED` (오늘부터 시작) + `RECRUITMENT_DEADLINE` (D-3 / D-1 / D-0) 을 한 번에 처리.

```sql
SELECT f.user_id, r.id AS recruitment_id, r.club_id, r.title, r.end_date,
       CASE
         WHEN r.start_date = CURRENT_DATE            THEN 'OPENED'
         WHEN (r.end_date - CURRENT_DATE) IN (3,1,0) THEN 'DEADLINE'
       END AS kind,
       (r.end_date - CURRENT_DATE) AS d
FROM club_favorite f
JOIN recruitment r ON r.club_id = f.club_id
WHERE r.status='OPEN' AND r.deleted_at IS NULL
  AND ( r.start_date = CURRENT_DATE
        OR (r.end_date - CURRENT_DATE) IN (3,1,0) );
```

행 단위로 `notificationService.createIfAbsent(...)`. `uq_notification_dedup` 위반 시 무시(멱등).

**`InterviewReminderJob`** — `cron = "0 0 * * * *"` 매시 정각. `interview_at BETWEEN now()+23h AND now()+25h` 인 Application 을 스캔해 `INTERVIEW_REMINDER` 를 멱등 INSERT.

### 5.3 카피 가이드 (예시)

| Type | title | body |
|---|---|---|
| `RECRUITMENT_OPENED` | `찜한 {clubName}의 새 모집이 시작됐어요` | `{recruitmentTitle} · 마감 {endDate}` |
| `RECRUITMENT_DEADLINE` (D-3) | `{clubName} 모집 마감 3일 전` | `{recruitmentTitle} · {endDate}` |
| `RECRUITMENT_DEADLINE` (D-1) | `{clubName} 모집 마감 하루 전` | `{recruitmentTitle} · 내일까지` |
| `RECRUITMENT_DEADLINE` (D-0) | `{clubName} 모집 오늘 마감` | `{recruitmentTitle}` |
| `INTERVIEW_SCHEDULED` | `{clubName} 면접 일정이 잡혔어요` | `{interviewAt} · {interviewLocation}` |
| `INTERVIEW_REMINDER` | `{clubName} 면접 하루 전` | `{interviewAt} · {interviewLocation}` |

---

## 6. 프론트엔드

`packages/types → packages/api → packages/hooks → apps/web/app/...` 순으로 추가.

### 6.1 신규/수정 라우트

```
apps/web/app/
  notifications/
    page.tsx                            NEW  내 알림 목록 (Client, 무한 스크롤)
    _components/NotificationItem.tsx    NEW
  me/
    favorites/
      page.tsx                          NEW  내가 찜한 동아리
      _components/FavoriteClubCard.tsx  NEW
  clubs/
    page.tsx                            MOD  카드 우상단 하트
    [clubId]/page.tsx                   MOD  헤더에 FavoriteToggleButton
    [clubId]/recruitments/[recruitmentId]/apply/page.tsx  MOD
      useApplicationDraft 자동저장 훅 연결 + "마지막 저장 HH:mm:ss" 표시
  _components/
    NotificationBell.tsx                NEW  헤더 종 + 안 읽은 카운트 배지 + 최근 5건 드롭다운
    FavoriteToggleButton.tsx            NEW  하트 토글 (sm/md)
```

### 6.2 packages 변경

```
packages/types/src/
  favorite.ts        NEW  FavoriteClub, FavoriteIdList
  draft.ts           NEW  ApplicationDraft
  notification.ts    NEW  Notification, NotificationType, NotificationPage

packages/api/src/client.ts
  favorites.list / ids / add / remove
  drafts.get / upsert / remove
  notifications.list / unreadCount / read / readAll

packages/hooks/src/
  useFavoriteListQuery, useFavoriteIdsQuery, useFavoriteToggleMutation
  useApplicationDraftQuery, useApplicationDraftMutation (debounced 2s)
  useNotificationListQuery (infinite), useUnreadCountQuery,
  useNotificationReadMutation, useNotificationReadAllMutation
```

### 6.3 UI 동작

- **NotificationBell**: `useUnreadCountQuery` (staleTime 30s, `refetchOnWindowFocus`). 드롭다운 항목 클릭 → `markRead → router.push(linkUrl)`. 비로그인 시 마운트 안 함.
- **FavoriteToggleButton**: 낙관적 업데이트, 실패 시 롤백 + 토스트. 비로그인 클릭 → `/login?next=...`.
- **임시저장**: 마운트 시 `GET /draft` 로 prefill. 폼 상태 변경 → debounce(2000ms) → `PUT /draft`. 제출 성공 시 draft 쿼리 invalidate. 모집 종료(410) → 토스트 후 폼 readonly.
- **/me/favorites**: 그리드 카드(로고/이름/카테고리/`진행 중 모집 N개`/하트 해제). 빈 상태에서 "동아리 탐색 →" CTA.
- **/notifications**: 시간 묶음(오늘/이번 주/이전), `unreadOnly` 토글. 자동 read 안 함(명시 클릭 또는 "모두 읽음").

### 6.4 목록 페이지 하트 충돌 방지

`/clubs` 목록에서는 카드별로 favorite 상태를 알아야 하는데, 카드마다 GET 하지 않고 `useFavoriteIdsQuery` 가 반환한 `Set<number>` 를 props 로 내려준다.

---

## 7. 테스트 전략

### 7.1 백엔드

- **도메인 단위**
  - `ClubFavoriteServiceTest` — add/remove, 중복 add 409, 비존재 동아리 404.
  - `ApplicationDraftServiceTest` — upsert 멱등, 모집 마감 시 410, submit 트랜잭션에서 draft delete.
  - `NotificationServiceTest` — `createIfAbsent` 동일 dedup_key 두 번 호출 시 row 1개, markRead·markAllRead.
- **잡 통합**
  - `DeadlineNotificationJobIntegrationTest` — Fixture Monkey 로 (찜 N × 모집 4종: D-3 / D-1 / D-0 / start=today) 시드, 잡 실행 후 row 수·type 검증. 두 번 실행해도 row 수 동일(멱등).
  - `InterviewReminderJobIntegrationTest` — `interviewAt` 23h / 25h 경계, 멱등.
- **도메인 이벤트**
  - `InterviewScheduledEventIT` — PATCH /interview → `INTERVIEW_SCHEDULED` 1건. interviewAt 변경 시 새 dedup_key 라 새 row, 기존 row 의 readAt 유지.
  - `RecruitmentOpenedEventIT` — `startDate <= today` 로 모집 생성 → 찜 유저들에게 `RECRUITMENT_OPENED` 1건씩.
- **컨트롤러 (RestAssured)**
  - 4개 도메인 endpoint happy path + 인증/권한/404/409/410 매트릭스.
  - `DELETE /favorites/{clubId}` 두 번 → 둘 다 204. `PATCH /notifications/{id}/read` 이미 읽음 → 204.

### 7.2 프론트엔드 (vitest + msw)

- `useApplicationDraftMutation` — 2초 디바운스, 마운트 시 prefill, 제출 후 invalidate.
- `FavoriteToggleButton` — 비로그인 클릭 시 로그인 라우팅, 낙관적 토글 실패 롤백.
- `/notifications` 페이지 — 무한 스크롤, "모두 읽음" 후 unreadCount 0 동기화.

---

## 8. 마이그레이션·롤아웃 순서

1. V14~V17 Flyway 머지 → develop CI 통과.
2. 백엔드 도메인·잡 머지하되 잡은 `@ConditionalOnProperty(name="duing.notification.jobs.enabled", havingValue="true")` 로 disable 상태로 배포.
3. 프론트 1차(찜 · 임시저장) 머지 — 즉시 동작.
4. 도메인 이벤트 + 즉시 알림(`INTERVIEW_SCHEDULED`, `RECRUITMENT_OPENED` on create) 활성화 + 프론트 알림 UI 머지.
5. `duing.notification.jobs.enabled=true` — 첫 06:00 KST 실행 모니터링.

`@TransactionalEventListener(phase = AFTER_COMMIT)` 로 발행 트랜잭션 롤백 시 알림이 생성되지 않게 한다.

---

## 9. 의도적 범위 밖 (Future work)

- 푸시 / 이메일 채널
- 사용자별 알림 설정(끄기·채널 선택)
- 알림 보존 정책(N일 후 자동 삭제)
- 운영진용 알림(새 지원자 도착 등)
- 동아리 상세 페이지(`/clubs/{id}`) 정보 보강 — 별도 spec
- 모집 reopen 흐름

---

## 10. 환경변수·설정

| 키 | 기본 | 설명 |
|---|---|---|
| `duing.notification.jobs.enabled` | `false` | 스케줄러 잡 활성 여부 (단계적 롤아웃) |
| `duing.notification.jobs.timezone` | `Asia/Seoul` | cron 평가 기준 타임존 |
| `duing.draft.autosave-debounce-ms` | `2000` | (프론트) `apps/web/.env.local` |
