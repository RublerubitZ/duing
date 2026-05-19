# 총동연 공지(Notice) 도메인 + 메인 공지 탭 분리 — 설계

- 작성일: 2026-05-20
- 범위: 총동연 어드민 기능군 중 **A+B (공지 도메인 + 메인 공지 탭 분리)**
- 후속: C (동아리 인증/상태 어드민 UI) · E (권한 인수인계) · F (신고/제재) · G (통계) · H (홍보). D (카테고리 enum → 테이블) 는 보류.

---

## 1. 배경 / 목표

- 메인 페이지의 "공지 탭" 이 현재 `/me/notifications` 로 라우팅되어 알림과 공지가 섞여 있음.
- 총동연(ADMIN) 이 축제·박람회·지원사업·공모전 등을 게시하는 **공지 도메인** 이 부재함.
- 본 작업의 목적:
  1. 공지를 별도 도메인으로 신설, 메인 페이지에 **이미지 중심 카드 피드** 로 노출
  2. "공지" 와 "알림" 의 진입점을 분리 (공지 = 메인 탭 / 알림 = 알림 아이콘)
  3. 작성 권한은 **ADMIN 전용** (LEADER 게시판은 후속)

### 도메인 경계 (요청에 따른 명시적 분리)
- **Notice** (`com.duing.domain.notice`) — 콘텐츠
- **Notification** (`com.duing.domain.notification`) — 개인 전달 이벤트 (기존, 변경 없음)
- **NoticeBroadcast** (`com.duing.domain.notice.broadcast`) — 공지 전달용 projection. Notification 과 코드·테이블 모두 분리

---

## 2. 데이터 모델

### 2.1 `notices`
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | bigserial PK | |
| `title` | varchar(120) NOT NULL | |
| `summary` | varchar(300) NOT NULL | 카드용 요약 |
| `content` | text NOT NULL | 마크다운 |
| `cover_image_url` | text NOT NULL | 대표 이미지 (필수). Supabase Storage URL prefix 화이트리스트 검증 |
| `link_url` | text NULL | 외부 링크 |
| `category` | varchar enum NOT NULL | `FESTIVAL` / `FAIR` / `FUNDING` / `CONTEST` / `GENERAL` |
| `tags` | text[] NOT NULL default `'{}'` | 자유 태그 (최대 8개, 각 ≤ 20자) |
| `visibility` | varchar enum NOT NULL | `PUBLIC` / `OFFICERS_ALL` / `CLUB_SCOPED` |
| `club_scope_role` | varchar enum NULL | `CLUB_SCOPED` 일 때만: `OFFICERS_ONLY` / `ALL_MEMBERS` |
| `is_pinned` | boolean NOT NULL default false | |
| `expires_at` | timestamptz NULL | NULL = 무기한. 지난 공지는 피드에서 제외되지만 상세 진입 가능 |
| `notify_on_publish` | boolean NOT NULL default false | PUBLIC 일 때만 유효. OFFICERS_ALL/CLUB_SCOPED 은 application 단에서 true 강제 |
| `author_id` | bigint FK users.id | |
| `deleted_at` | timestamptz NULL | 소프트 삭제 |
| `created_at`, `updated_at` | timestamptz | |

### 2.2 `notice_target_clubs` (CLUB_SCOPED 전용)
| 컬럼 | 타입 |
|---|---|
| `notice_id` | bigint FK notices.id ON DELETE CASCADE |
| `club_id` | bigint FK clubs.id |
| PK | (`notice_id`, `club_id`) |

### 2.3 `notice_broadcasts` (공지 전달용 projection, PUBLIC + notify_on_publish=true 전용)
| 컬럼 | 타입 |
|---|---|
| `id` | bigserial PK |
| `notice_id` | bigint FK UNIQUE |
| `title`, `body`, `link_url` | snapshot (발행 시점 고정, 공지 수정해도 알림 변경 없음) |
| `created_at` | timestamptz |
| `deleted_at` | timestamptz NULL |

### 2.4 `notice_broadcast_reads`
| 컬럼 | 타입 |
|---|---|
| `broadcast_id` | bigint FK |
| `user_id` | bigint FK |
| `read_at` | timestamptz NOT NULL |
| PK | (`broadcast_id`, `user_id`) |
| 의미 | row 존재 = 읽음 |

### 2.5 인덱스
- `notices(visibility, is_pinned DESC, created_at DESC)` — 메인 피드
- `notices(category)`
- GIN(`notices.tags`)
- `notice_target_clubs(club_id, notice_id)` — 멤버 가시성 lookup
- `notice_broadcasts(created_at DESC)` — 알림 조회

### 2.6 무결성 (애플리케이션 레이어)
- `visibility = PUBLIC` → `club_scope_role IS NULL` AND `notice_target_clubs` 0 rows
- `visibility = OFFICERS_ALL` → 동일
- `visibility = CLUB_SCOPED` → `club_scope_role NOT NULL` AND `notice_target_clubs` ≥ 1 rows
- `cover_image_url` 은 Supabase Storage prefix 화이트리스트 검증
- `notify_on_publish` 는 PUBLIC 외에서는 true 로 강제 정규화

---

## 3. 알림 Fan-out 전략

### 3.1 visibility 별 동작

| visibility | notify_on_publish | 동작 |
|---|---|---|
| `PUBLIC` | false | 알림 발송 없음 |
| `PUBLIC` | true | `notice_broadcasts` 1 row 생성 (가상 알림) |
| `OFFICERS_ALL` | (강제 true) | 모든 동아리의 LEADER/OFFICER 대상 `notifications` bulk insert |
| `CLUB_SCOPED` + `OFFICERS_ONLY` | (강제 true) | 지정 클럽의 LEADER/OFFICER 대상 fan-out |
| `CLUB_SCOPED` + `ALL_MEMBERS` | (강제 true) | 지정 클럽의 모든 멤버 대상 fan-out |

모든 발송은 **공지 생성 트랜잭션 내 동기** 처리. 비동기 큐 미도입.

### 3.2 수신자 상한선
- 발행 트랜잭션에서 fan-out 수신자 수를 사전 계산
- **2000명 초과** → `RecipientLimitExceededException` → 400 응답, 트랜잭션 롤백 (공지·target_clubs·notifications/broadcasts 어떤 row 도 남지 않음)
- 운영팀이 visibility 를 좁히도록 유도. 사전 카운트 API 는 OOS

### 3.3 통합 알림 조회 (`GET /me/notifications`)
- 두 소스를 union:
  1. 개인 알림 (기존 `notifications WHERE user_id = me`)
  2. 본인 대상 broadcast (`notice_broadcasts LEFT JOIN notice_broadcast_reads ON user_id = me`)
- 페이지네이션: **offset (`page`, `size`)** — MVP 단순화
  - 두 소스에서 각각 `limit (page+1)*size` 만큼 over-fetch → 메모리 머지·`created_at DESC` 정렬 → 페이지 슬라이스
- 응답 DTO 디스크리미네이터:
  ```
  { source: "PERSONAL" | "BROADCAST", id, title, body, linkUrl, createdAt, isRead }
  ```
- 읽음 처리:
  - 개인: 기존 PATCH 그대로
  - broadcast: `notice_broadcast_reads` upsert

---

## 4. 백엔드 API

### 4.1 Notice (콘텐츠)

| Method | Path | 권한 | 설명 |
|---|---|---|---|
| `POST` | `/admin/notices` | ADMIN | 공지 생성 + visibility 별 fan-out/broadcast 트랜잭션 처리 |
| `PATCH` | `/admin/notices/{id}` | ADMIN | 수정. 알림 재발송 없음. 스냅샷 고정 |
| `DELETE` | `/admin/notices/{id}` | ADMIN | 소프트 삭제 (`deleted_at`). broadcast 도 함께 hidden |
| `GET` | `/admin/notices` | ADMIN | 관리 목록. 만료/삭제 포함 토글, visibility 필터 |
| `GET` | `/notices` | 모두 (비로그인 포함) | 공개 피드. `category?`, `tag?`, `keyword?`, `page`, `size` |
| `GET` | `/notices/{id}` | 모두 | 상세. 가시 범위 밖이면 403 |

### 4.2 NoticeBroadcast / 알림 통합

| Method | Path | 권한 | 설명 |
|---|---|---|---|
| `GET` | `/me/notifications` | 인증 | 개인 + broadcast offset union |
| `PATCH` | `/me/notifications/{id}/read` | 인증 | 개인 알림 읽음 (기존 그대로) |
| `PATCH` | `/me/notifications/broadcasts/{broadcastId}/read` | 인증 | broadcast 읽음 upsert |

### 4.3 발행 시 트랜잭션 동작 (`POST /admin/notices`)
1. `notices` insert
2. `visibility=CLUB_SCOPED` → `notice_target_clubs` bulk insert
3. fan-out 수신자 수 계산 (visibility 별 쿼리)
4. 수신자 > 2000 → 롤백, 400 `RECIPIENT_LIMIT_EXCEEDED`
5. visibility 별 처리:
   - `PUBLIC` + `notify_on_publish=true` → `notice_broadcasts` 1 row
   - `OFFICERS_ALL` / `CLUB_SCOPED` → `notifications` bulk insert
   - `PUBLIC` + `notify_on_publish=false` → 추가 처리 없음

### 4.4 가시성 필터 (`GET /notices`)
- 비로그인 → `visibility = PUBLIC` AND `expires_at IS NULL OR expires_at > now()` AND `deleted_at IS NULL`
- STUDENT → 위 + `(CLUB_SCOPED AND club_scope_role=ALL_MEMBERS AND target_club ∈ 내가 멤버인 클럽들)`
- OFFICER/LEADER → 위 + `OFFICERS_ALL` + `(CLUB_SCOPED AND target_club ∈ 내가 운영진인 클럽들 AND club_scope_role ∈ (OFFICERS_ONLY, ALL_MEMBERS))`
- ADMIN → 만료·삭제 제외하고 전부 (관리 목록은 `/admin/notices`)

### 4.5 검증
- `title ≤ 120`, `summary ≤ 300`, `content ≤ 20000`
- `tags` 최대 8개, 각 ≤ 20자
- `cover_image_url` Supabase Storage prefix 화이트리스트
- `visibility=CLUB_SCOPED` → `target_club_ids ≥ 1`, 존재하는 club, 중복 제거
- `notify_on_publish` PUBLIC 외 강제 true 정규화

---

## 5. 프론트엔드 화면 & 라우팅

### 5.1 라우팅 변경
| 경로 | 변경 |
|---|---|
| 메인 페이지 "공지 탭" | **현재 `/me/notifications` → 변경 후 `/notices`** |
| 알림 아이콘 | `/me/notifications` 그대로 |
| `/notices` | 신규 — 카드 피드 |
| `/notices/{id}` | 신규 — 공지 상세 |
| `/admin/notices` | 신규 — ADMIN 관리 목록 |
| `/admin/notices/new` | 신규 — 작성 폼 |
| `/admin/notices/{id}/edit` | 신규 — 수정 폼 |

### 5.2 `/notices` 카드 피드
- 헤더: 카테고리 segmented control (`전체` / `축제` / `박람회` / `지원사업` / `공모전` / `일반`) + 검색 인풋
- 태그 칩 필터 (active 태그 토글)
- 카드 그리드: 모바일 1열 / 데스크탑 2~3열
  - 16:9 cover image + 카테고리 chip + `📌` (pinned) + 제목 (2줄 ellipsis) + 요약 (2줄) + 발행일 + `linkUrl` 있으면 외부 링크 아이콘
- **offset 페이지네이션** (`Pagination` 컴포넌트 — prev/next + 페이지 번호)
- 빈 상태 메시지

### 5.3 `/notices/{id}` 상세
- 헤더: 뒤로가기 + 카테고리 chip
- 본문: cover image + 제목 + 메타(작성일 · visibility 는 ADMIN 만) + 마크다운 렌더 + `linkUrl` 있으면 CTA 버튼
- 만료 공지: 상단 "마감된 공지" 배너 (직접 진입은 허용)
- 가시 범위 밖: 403 → `/notices` redirect + 토스트

### 5.4 `/admin/notices` 관리 목록
- 테이블: 제목 · 카테고리 · visibility · 발행일 · 만료일 · 알림 발송 여부 · 액션(수정/삭제)
- 상단: `+ 새 공지` · visibility 필터 · "만료/삭제 포함" 토글

### 5.5 `/admin/notices/new` & `/edit`
- 폼 필드:
  - 제목, 요약, 본문(마크다운 에디터 — `@uiw/react-md-editor`)
  - 대표 이미지 (`FileApi` 재사용)
  - 외부 링크
  - 카테고리 select
  - 태그 chip input (최대 8)
  - Visibility radio (`PUBLIC` / `OFFICERS_ALL` / `CLUB_SCOPED`)
    - `CLUB_SCOPED` → 클럽 multi-select + `OFFICERS_ONLY` / `ALL_MEMBERS` 라디오
  - 만료일 (date picker, optional)
  - 알림 발송 checkbox — PUBLIC 일 때만 활성, 그 외 자동 ON 비활성 + 안내문
  - 고정 checkbox
- 2000명 초과 응답 → 토스트 + 폼 유지

### 5.6 `/me/notifications` 알림 페이지
- 기존 컴포넌트에 broadcast 통합. 사용자 입장에서 시각 차이 없음
- 아이템 클릭 → source 분기 읽음 마킹 + `linkUrl` 이동

### 5.7 컴포넌트
- `NoticeCard`
- `NoticeForm` (new/edit 공유)
- `VisibilityPicker` (CLUB_SCOPED 멀티셀렉트 sub-form)

---

## 6. 권한 매트릭스

| 작업 | 비로그인 | STUDENT | OFFICER/LEADER | ADMIN |
|---|---|---|---|---|
| `GET /notices` | PUBLIC 만 | + 멤버 CLUB_SCOPED(ALL_MEMBERS) | + OFFICERS_ALL + 운영중 클럽 CLUB_SCOPED | 만료·삭제 제외 전부 |
| `GET /notices/{id}` | PUBLIC 만 | 본인 가시 범위 | 본인 가시 범위 | 전부 |
| `POST/PATCH/DELETE /admin/notices`, `GET /admin/notices` | ❌ | ❌ | ❌ | ✅ |
| `/me/notifications` 응답 broadcast 포함 | — | ✅ (본인 가시) | ✅ | ✅ |

Spring Security: `/admin/notices/**` → `hasRole('ADMIN')`. 도메인 `NoticeAccessPolicy` 가 GET 필터링·상세 접근 검증.

---

## 7. 테스트 전략
- **Repository (QueryDSL)**: visibility 별 필터링 정확성. 케이스: 비로그인/STUDENT/OFFICER/ADMIN 별 보이는 공지 수
- **Service**:
  - Fan-out: `PUBLIC notify=false` → 0건 / `OFFICERS_ALL` → officer 수 / `CLUB_SCOPED` 케이스
  - 2000명 초과 → 예외 + 트랜잭션 롤백 (어떤 row 도 안 남음)
  - `CLUB_SCOPED` 검증: `club_scope_role` 누락, `target_club_ids` 빈 배열, 존재 안 하는 club
  - 만료 공지 → 피드 제외, 상세 접근 가능
- **Controller**: `@WithMockUser` 권한별 403
- **알림 통합 조회**: offset union 머지 정렬 정확성, 페이지 경계

---

## 8. 마이그레이션 (Flyway)
1. `V{N}__create_notice.sql` — `notices` + `notice_target_clubs` + 인덱스
2. `V{N+1}__create_notice_broadcast.sql` — `notice_broadcasts` + `notice_broadcast_reads`
- 기존 `notifications` 테이블 변경 없음 (도메인 분리 유지)

---

## 9. 위험 / 결정사항
- **수신자 사전 카운트 API 없음** — 작성 후 거부될 수 있음. UX 약점 수용, 후속 PR 검토 여지
- **소프트 삭제** — 운영 안전성 우선. broadcast 도 함께 hidden
- **offset union 페이지네이션** — over-fetch 비효율 있으나 MVP 단순화 우선. 데이터 증가 시 cursor 마이그레이션 (OOS)
- **알림 스냅샷 고정** — 공지 수정해도 broadcast/notifications 의 title/body 는 변경 X. 의도된 동작

---

## 10. Out of Scope
- 동아리 LEADER 가 작성하고 동아리 내 STUDENT 가 보는 동아리 게시판 (별도 도메인, 후속)
- 공지 예약 발행 (`publishAt`, `DRAFT/SCHEDULED` 상태)
- 첨부 파일 (이미지 외)
- 공지 댓글/반응
- 알림 푸시(웹푸시·이메일)
- 공지 노출·클릭 통계
- 카테고리 enum → 테이블화 (D 작업)
- 2000명 초과 시 비동기 큐 fan-out
- 알림 cursor 페이지네이션 마이그레이션
- 수신자 사전 카운트 API
- 작성자 일치 강제 (현재는 ADMIN 누구나 수정·삭제 가능)
