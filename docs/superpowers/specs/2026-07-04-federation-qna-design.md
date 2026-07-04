# 총동연 Q&A 시스템 + 모바일 내비게이션 설계 스펙

- 작성일: 2026-07-04
- 상태: 확정 (설계 패널 3인 + 적대 검증 6인 + 재검토 검증 3인 반영, 사용자 승인)
- 전제: 전역 Role `ADMIN` = 총동연. 새 Role 신설 없음.
- 기능 범위: ① 총동연 FAQ(공개 조회 + 관리자 CRUD) ② 1:1 비밀문의(학생 작성 → 총동연 답변) ③ 홈 Q&A 섹션 ④ 진입점/내비게이션 반영

## Out of Scope (명시적 제외)

- 답변 삭제(수정만 지원, ANSWERED 역전이 없음 — 오발송은 수정으로 정정)
- 문의 재오픈/역전이, 삭제 복구, '삭제 포함 보기' 토글(P3 후보)
- 첨부파일 실구현(P1은 스키마 슬롯만 — 이미지 P2, PDF P3)
- 문의 카테고리, 만족도 평가, 공개 Q&A 게시판, 챗봇
- NAV_TABS 공유 상수화 리팩터링(비차단 별도 이슈)
- FEDERATION 전용 Role 신설(총학/총동연 분리 필요 시점에 UserRole 확장으로)

---

## 1. 전체 UX 평가

**전제 보정.** 모바일 하단 탭은 홈(/) · 탐색(/clubs) · 시설(/facilities) · 캘린더(/calendar) · 공지(/notices) 5탭. My 탭·Recruit 탭 없음, /me 진입은 상단 유저메뉴뿐.

**Q&A는 저빈도·과업형**(사용자당 월 0~2회). 하단 탭은 희소 자원 — 발견성은 탭이 아니라 "필요한 순간의 맥락 진입점"(홈 섹션·공지 페이지·Footer·알림 딥링크)으로 해결.

**기존 자산 재사용**: 공지 필터 패턴, /me/* 미들웨어 보호, /admin 콘솔(ADMIN_SECTIONS), Spring 이벤트 알림, report 도메인("제출→관리자 상태 전이") 선례.

**최대 운영 리스크는 무응답**(방학·임원 교체기 방치) → 관리자 접수 알림 + 지연 안내 문구 + 리마인더 잡으로 방어.

**명칭**: 동아리 상세의 "Q&A" 탭(ClubFaq)과 충돌 방지 위해 사용자 대면 명칭은 "자주 묻는 질문" / "1:1 문의".

## 2. 추천 IA

```
[공개]   /faq                    FAQ 목록 — 게스트 접근, 카테고리·검색·고정, 아코디언 인라인, 탭바 숨김
         /faq?item={id}          딥링크 — 공개 단건 GET으로 상단 펼침 카드 (페이지네이션 독립)
[학생]   /me/inquiries           내 문의 목록 (상태 뱃지)   ← middleware STUDENT_PREFIXES('/me') 보호
         /me/inquiries/new       문의 작성 (풀페이지 폼)
         /me/inquiries/[id]      상세 — RECEIVED만 수정 노출, 삭제는 항상
         /me                     스크롤 스파이에 '내 문의' 요약 블록
         /notifications          (기존) 알림 → /me/inquiries/{id} 딥링크 (404 시 목록 폴백)
[관리자] /admin/faqs             FAQ 관리 (+/new, /[id]/edit, 위/아래 이동·고정·공개 토글·카테고리 관리)
         /admin/inquiries        문의 목록 (상태 필터 탭 + 미답변 배지)
         /admin/inquiries/[id]   상세 · "답변 작성" CTA(=답변중 전이) · 종결
```

- 비밀문의를 /me 아래 두는 근거: DUing 불변식(공개 콘텐츠=독립 공개 라우트, 개인 데이터=/me 하위) + 미들웨어 보호 재사용 + "내게 온 답변" 알림 딥링크 의미 일치 + 향후 My 탭 신설 시 자동 편입.
- 공개 FAQ API / 인증 문의 API 계약 완전 분리 — 비밀문의가 어떤 공개 응답에도 실리지 않음.
- **세트 출시 원칙**: 홈 섹션·공지 링크·/me 블록·Footer·알림 딥링크·sitemap을 한 릴리스로. 탭바를 숨기므로 진입점 세트가 유일한 발견 경로. **P1 PR 전부 develop 머지 완료 전 main 릴리스 금지.**

## 3. 모바일 Navigation

| 안 | 평가 | 결론 |
|---|---|---|
| A. 하단 탭 추가 | 저빈도 기능이 탭 희소 자원 소진, 6탭 오탭 증가, 향후 My/커뮤니티 자리 소멸 | 기각 |
| B. 더보기 메뉴 | DUing에 없는 패턴 신설 비용 > 기능 가치, 발견성 최하 | 기각 |
| C. 마이페이지 내부 | My 탭이 없어 발견성 최악 + 비로그인 신입생(FAQ 최대 수요층) 차단 | 단독 기각 — "내 문의=/me"만 채택 |
| D. 공지 서브탭 | 기존 세그먼트(학교\|내 동아리)는 '출처' 축 — 콘텐츠 타입 축 오염 + 비밀문의 권한 경계를 공개 페이지에 욱여넣음 | 기각 |
| **E. 하이브리드** | FAQ=/faq 독립 공개 라우트, 문의=/me/inquiries, 발견성=맥락 진입점 세트 | **채택** |

### /faq 탭바 처리 — 숨김

**matchTabHref 코드 무변경**(탭 외 경로 → 자연 null → 탭바 미노출). 근거:
- 기존 불변식 "탭 외 경로 = 탭바 숨김"의 선례가 /introduce(공개·브라우징형·탭 외, 테스트 박제). 교차 매핑 선례 0.
- 공지 탭 활성은 aria-current="page" 거짓 + 활성처럼 보이는 탭을 누르면 이동하는 자기모순. FAQ(상시 참고)와 공지(시점성 게시물)는 멘탈모델이 다름.
- 매핑은 데스크톱 ExploreNav 특례까지 2곳 유지 비용.

동반 변경:
- bottom-nav.test.tsx에 '/faq 미노출' 회귀 테스트 1건(/introduce 케이스와 동형).
- BottomNav.tsx 상단 주석의 미노출 경로 열거에 FAQ 반영.
- **/faq 상단 헤더는 `<ExploreNav slimOnMobile />`** — HomeNav는 '홈' 활성 하드코딩이라 거짓 활성 재생산 금지. ExploreNav는 pathname 기반 전 링크 자연 비활성(active prop 전달 금지).
- 페이지 하단 HomeFooter 포함(모바일 후속 동선).
- 공지 페이지 데스크톱 사이드바 "자주 묻는 질문 → /faq" 링크(SideIcon.faq는 '일반' 카테고리가 사용 중 — 별도 아이콘), 모바일 히어로 하단 텍스트 링크.

### 홈 Q&A 섹션

- 위치: FeaturedClubs(인기 동아리) 다음, LeaderCta 앞. LeaderCta(hidden md:block)와 달리 **모바일 노출**.
- 형태: 서버 컴포넌트 `HomeQnaSection`(서버 직접 fetch, 실패 시 섹션 통째 숨김 — BE 다운 오인 방지 주석) + 클라이언트 아코디언. 고정 FAQ 우선 3~4개, 질문 1줄→펼침 시 답변 요약 2~3줄, "자세히 보기"→/faq?item={id}. 세로 리스트(가로 캐러셀 금지), 데스크톱 2열 허용.
- 제목 "자주 묻는 질문" + 서브카피 "총동연에 궁금한 점을 물어보세요".
- CTA 2개: 보조 "FAQ 전체 보기"→/faq, 주요 "1:1 문의하기"→/me/inquiries/new(비로그인 시 /login?next=, toLinkRoute 검증).
- 비밀문의 콘텐츠는 홈에 절대 미노출.

## 4. DB 설계

도메인 `domain/federation/` 신규(ClubFaq와 충돌 방지 위해 Federation 접두사). Flyway `V73__create_federation_faq.sql` / `V74__create_federation_inquiry.sql`(번호는 머지 시점 재확인). **RLS 활성화 누락 시 RowLevelSecurityMigrationTest 빌드 실패.**

```sql
-- V73
CREATE TABLE federation_faq_category (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX uq_federation_faq_category_name
    ON federation_faq_category (name) WHERE deleted_at IS NULL;
ALTER TABLE federation_faq_category ENABLE ROW LEVEL SECURITY;

CREATE TABLE federation_faq (
    id           BIGSERIAL PRIMARY KEY,
    category_id  BIGINT NOT NULL REFERENCES federation_faq_category (id),
    question     VARCHAR(300) NOT NULL,
    answer       TEXT NOT NULL,               -- Markdown
    is_pinned    BOOLEAN NOT NULL DEFAULT FALSE,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order   INT NOT NULL DEFAULT 0,
    view_count   BIGINT NOT NULL DEFAULT 0,   -- 증가 로직 P2
    author_id    BIGINT NOT NULL REFERENCES users (id),
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_federation_faq_answer_length CHECK (char_length(answer) <= 4000)
);
CREATE INDEX idx_federation_faq_public
    ON federation_faq (is_published, is_pinned DESC, sort_order, id DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_federation_faq_category
    ON federation_faq (category_id) WHERE deleted_at IS NULL;
ALTER TABLE federation_faq ENABLE ROW LEVEL SECURITY;

-- V74
CREATE TABLE federation_inquiry (
    id            BIGSERIAL PRIMARY KEY,
    author_id     BIGINT NOT NULL REFERENCES users (id),
    title         VARCHAR(120) NOT NULL,
    content       TEXT NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
    answered_at   TIMESTAMP WITH TIME ZONE,
    closed_at     TIMESTAMP WITH TIME ZONE,
    closed_reason VARCHAR(200),
    version       BIGINT NOT NULL DEFAULT 0,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_federation_inquiry_status
        CHECK (status IN ('RECEIVED', 'IN_PROGRESS', 'ANSWERED', 'CLOSED')),
    CONSTRAINT chk_federation_inquiry_status_pair
        CHECK ((status <> 'ANSWERED' OR answered_at IS NOT NULL)
           AND (status <> 'CLOSED' OR closed_at IS NOT NULL)),
    CONSTRAINT chk_federation_inquiry_content_length CHECK (char_length(content) <= 2000)
);
CREATE INDEX idx_federation_inquiry_author
    ON federation_inquiry (author_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_federation_inquiry_status
    ON federation_inquiry (status, created_at DESC) WHERE deleted_at IS NULL;
ALTER TABLE federation_inquiry ENABLE ROW LEVEL SECURITY;

CREATE TABLE federation_inquiry_answer (
    id          BIGSERIAL PRIMARY KEY,
    inquiry_id  BIGINT NOT NULL REFERENCES federation_inquiry (id),
    content     TEXT NOT NULL,
    answered_by BIGINT NOT NULL REFERENCES users (id),  -- 학생 응답엔 비노출
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_federation_inquiry_answer_length CHECK (char_length(content) <= 4000)
);
CREATE UNIQUE INDEX uq_federation_inquiry_answer
    ON federation_inquiry_answer (inquiry_id) WHERE deleted_at IS NULL;  -- 이중 답변 DB 백스톱
ALTER TABLE federation_inquiry_answer ENABLE ROW LEVEL SECURITY;
```

첨부(P2): `federation_inquiry_attachment(id, inquiry_id FK, answer_id FK nullable, file_url(500), file_name(255), content_type(100), file_size, sort_order, created_at, deleted_at)` — **BaseEntity 미상속**(Notification 전례, 수정 불가 리소스라 updated_at 없음). RLS 활성화.

### 엔티티 규약

- BaseEntity 상속 + soft delete. **FederationInquiry의 @SQLDelete는 version 조건 포함**(Application.java 전례): `UPDATE federation_inquiry SET deleted_at = NOW() WHERE id = ? AND version = ?` — 학생 삭제 vs 관리자 답변 레이스에서 한쪽이 반드시 충돌 감지.
- 카테고리 삭제는 행 잠금(PESSIMISTIC_WRITE) 후 FAQ 존재 검사, FAQ 생성·수정은 같은 트랜잭션에서 카테고리 유효성 재검증.
- 검색: 수백 건 규모 → QueryDSL containsIgnoreCase(ILIKE). pg_trgm GIN 인덱스는 P3.
- 생성은 정적 팩토리, 수정은 도메인 메서드, 빌더 private, HTML 미사용(Markdown)이므로 sanitizer 불요.

### 상태머신 (FederationInquiryStatus)

```
RECEIVED(접수) ──관리자 "답변 작성" CTA = PATCH {IN_PROGRESS, version}──▶ IN_PROGRESS(답변중)
     │                                                                      │
     └───────────── 답변 POST(version echo 필수) ────────────┐               │
                                                            ▼               ▼
                                                    ANSWERED(답변완료) ◀── 답변 POST(echo 불요)
RECEIVED/IN_PROGRESS/ANSWERED ──관리자 PATCH {CLOSED, closedReason?}──▶ CLOSED(종료)
```

**IN_PROGRESS 전이 — 명시적 PATCH, GET 부작용 없음**
- 트리거: 관리자 상세 화면의 "답변 작성" CTA 클릭(답변 폼 오픈과 융합 — 답변하려면 반드시 거치는 동선).
- `PATCH /admin/federation/inquiries/{id}/status {status: IN_PROGRESS, version}` — **FE가 렌더한 version 필수 동봉**, 불일치 409 "문의가 수정되었습니다" → FE refetch+배너 후 재시도. stale-render 창(렌더 후~클릭 전 학생 수정, 트랜잭션 비겹침이라 낙관락 못 잡음)을 노력 투입 전에 차단.
- 멱등: 이미 IN_PROGRESS → 204 no-op(그 상태의 학생 수정은 상태 검증이 차단하므로 version 미증가 무해). ANSWERED/CLOSED → 409.
- 동시 전이 낙관락 충돌(ObjectOptimisticLockingFailureException) → catch 후 재조회, IN_PROGRESS면 204 수렴(GeneralLeaderSuccessionService catch 전례), ANSWERED/CLOSED면 409.
- 전례 정합: report 도메인도 명시적 관리자 PATCH 편승 전이, GET 부작용은 전 도메인 전무. GET이 순수해 readOnly 트랜잭션 함정 없음.

**답변 POST** — RECEIVED|IN_PROGRESS에서 허용:
- RECEIVED 직행(전이 생략/실패 fallback): version echo 필수(불일치 409).
- IN_PROGRESS 경로: echo 불요(전이 시점 잠금이 보장).
- **조건부 갱신**: `deleted_at IS NULL AND status IN ('RECEIVED','IN_PROGRESS')` 검증 실패 시 409 "삭제되었거나 이미 답변된 문의입니다". FE는 작성 draft 보존(작성물 유실 금지).
- 답변 등록은 반드시 inquiry 엔티티 dirty-checking 갱신(version 증가) 동반 — JPQL 벌크 업데이트 금지.
- 학생 알림은 커밋 성공에 종속(AFTER_COMMIT 리스너) — 삭제 건 알림 원천 차단.
- 이중 답변: 낙관락 1차 + partial unique DB 백스톱, 늦은 쪽 409 시 FE draft 보존.

**기타 전이 규칙**
- 답변 수정: ANSWERED만(CLOSED 409). 답변 삭제 미지원.
- CLOSED: 관리자만, closedReason 선택 입력. 무답변 종결(RECEIVED|IN_PROGRESS→CLOSED) 시 학생 알림.
- 무답변 IN_PROGRESS 24~48h auto-revert 잡(P2) — 학생 수정 잠금 상한. env 플래그 명시(prod 잡 기본 활성 함정).
- 전이 규칙은 enum `canTransitionTo(next)`로 캡슐화. 동시성 지점은 구현 시 adversarial-review 대상.

### 학생 수정·삭제 정책

- **수정 = RECEIVED만.** 원 요구사항 "답변 전까지"와의 관계: IN_PROGRESS가 "읽음"이 아니라 "답변 작성 시작"이므로 학생은 관리자가 실제 쓰기 시작 전까지 수정권 유지 — 충실한 근사. 낙관락만으론 사람-시간 레이스(작성 중 수정)를 못 막고, ANSWERED까지 허용(A안)은 관리자 작성물이 제출 순간 409로 유실되는 비대칭 비용 — 작성 시작 시점 잠금이 최적 절충. 잔여 격차(방치된 폼)는 auto-revert로 상한. FE 안내: "총동연이 답변을 작성 중이라 수정할 수 없어요".
- **삭제 = 전 상태 허용**(soft delete — 감사 이력 DB 보존, PII 자기결정권). 확인 다이얼로그(P1): "받은 답변도 함께 볼 수 없게 되며 복구할 수 없습니다".

### 삭제 정책 (삭제 이후의 조회·운영)

- **가시성**: 학생·관리자 모두 기본 조회(목록·상세·미답변 배지)에서 제외. 예외 1곳 — **admin 상세만 전용 에러 `INQUIRY_DELETED`(410)** → FE "작성자가 삭제한 문의입니다"(관리자는 접수 알림으로 존재를 이미 알아 은닉 실익 없음, 알림 클릭→맨 404 방지). 학생 측 타인 접근은 일반 404(존재 은닉).
- **답변 레코드**: cascade 삭제 안 함(접근 경로 없어 비노출, 단순성).
- **감사**: DB 행 보존, 복구 미지원. P3 '삭제 포함 보기' 토글 후보.
- **통계 이원화**: 배지·목록 = 삭제 제외 / 볼륨·SLA 집계(월 문의 수·답변률·답변 소요시간) = 삭제 포함(생성 시점 불변 — 소급 변동·생존편향 방지). 집계 쿼리는 deleted_at 조건 명시 기술(@SQLRestriction JPQL 적용 여부 주석이 코드베이스 내 상충 — 암묵 의존 금지, 통합 테스트 고정).
- **도배 가드 이중화**: (a) 열린 RECEIVED 5건 + (b) 24h 생성 N건(soft delete 포함 네이티브 카운트) — (a)만으론 삭제→재작성 루프 우회 + 새 dedupKey로 관리자 알림 스팸.
- **PII**: PiiRetentionJob은 대상 테이블 하드코딩 — 신규 테이블 자동 미포함. P3 문의 본문 파기 배치 설계 시 notification 행(dedupKey prefix) 포함 선기록. 작성자 익명화+본문 잔존 비대칭은 운영 결정 문서에 명시.

### FAQ 카테고리 — 테이블(enum 아님) 확정

- **관리 주체 논거(핵심)**: 카테고리 변경 주체가 개발팀이 아닌 총동연(비개발자·매년 교체) — enum이면 개편마다 개발팀 티켓. NoticeCategory(enum)와 다른 선택인 이유: 공지 카테고리는 플랫폼이 정의, FAQ 카테고리는 입주 조직이 정의 — 관리 주체가 다름.
- enum은 표시 순서·노출 관리 표현 불가. enum+DB 문자열 절충은 배포 필요+무결성 없음 — 양쪽 최악.
- P1 = 시드 5개 + 생성 + 이름 수정 + 순서 변경(전부 저비용). **삭제만 P2**(FK RESTRICT+409 또는 is_active 비활성화 대체).

### ERD

```
users 1 ─── * federation_inquiry 1 ─── 0..1 federation_inquiry_answer
  │                  │ 1                          │ 0..1
  │(answered_by)     └──── * federation_inquiry_attachment ─┘ (answer_id nullable, P2)
federation_faq_category 1 ─── * federation_faq (author_id → users)
```

## 5. API 설계

Prefix `/api/v1`. 응답 `ApiResponse<T>`, 페이징 `PageResponse<T>`.

### 공개 — SecurityConfig permitAll은 **정확 경로만** (`/federation/**` 와일드카드 금지: 문의 URL 방어층 소멸)

허용 매처(GET): `/api/v1/federation/faqs`, `/api/v1/federation/faqs/*`, `/api/v1/federation/faq-categories`

| Method | URL | 설명 |
|---|---|---|
| GET | `/federation/faqs?categoryId=&keyword=&page=&size=` | 공개 목록 (published만, pinned 우선 → sort_order → id DESC) |
| GET | `/federation/faqs/{faqId}` | 공개 단건 — 딥링크용 (미공개·삭제 404) |
| GET | `/federation/faq-categories` | 카테고리 (sort_order 순) |

조회수는 P2 `POST /federation/faqs/{faqId}/view`(펼침 시, FE 세션 1회+BE 쿨다운) — GET 증가 금지(크롤러 노이즈).

### 학생 (`@PreAuthorize("isAuthenticated()")`)

| Method | URL | 설명 |
|---|---|---|
| POST | `/federation/inquiries` | 작성 → 201 + id. 도배 가드 이중화 초과 시 409 |
| GET | `/me/federation-inquiries?status=&page=&size=` | 내 목록 (`/me/notifications` 패턴) |
| GET | `/federation/inquiries/{inquiryId}` | 상세 — **작성자 전용, 그 외 404**(ADMIN도 admin 경로만) |
| PATCH | `/federation/inquiries/{inquiryId}` | 수정 (작성자+RECEIVED만) → 204 |
| DELETE | `/federation/inquiries/{inquiryId}` | 삭제 (작성자, 전 상태, soft) → 204 |

### 관리자 (`@PreAuthorize("hasRole('ADMIN')")` 클래스 레벨 — AdminNoticeController 패턴)

| Method | URL | 설명 |
|---|---|---|
| GET | `/admin/federation/faqs?published=&categoryId=&keyword=&page=` | 비공개 포함 |
| POST / PATCH / DELETE | `/admin/federation/faqs(/{faqId})` | CRUD (생성 시 sortOrder 입력 없음 — 맨 뒤 자동) |
| PUT | `/admin/federation/faqs/order` | 정렬 전체 교체 `{orderedIds}` (ClubPhotoApi PUT 전례) — P1 |
| POST / PATCH | `/admin/federation/faq-categories(/{id})` | 생성·수정(이름+sortOrder) — P1 |
| DELETE | `/admin/federation/faq-categories/{id}` | 삭제 (FAQ 있으면 400) — P2 |
| GET | `/admin/federation/inquiries?status=&keyword=&page=` | 전체 — leftJoin users, 탈퇴/익명화 "탈퇴 회원" 표기, count·목록 조인 일치 |
| GET | `/admin/federation/inquiries/{inquiryId}` | 순수 조회. 삭제 건 `INQUIRY_DELETED`(410) |
| PATCH | `/admin/federation/inquiries/{inquiryId}/status` | `{IN_PROGRESS, version}`(답변 작성 CTA) 또는 `{CLOSED, closedReason?}` → 204 |
| POST | `/admin/federation/inquiries/{inquiryId}/answer` | 답변 등록 `{content, version?}` → 201, ANSWERED 전이+알림 |
| PATCH | `/admin/federation/inquiries/{inquiryId}/answer` | 답변 수정 (ANSWERED만) → 204, 재알림 없음 |

### DTO (record, 기존 네이밍)

- `CreateFederationInquiryRequest(title @Size(max=120), content @Size(max=2000))` / `UpdateFederationInquiryRequest(동일)`
- `FederationInquirySummaryResponse(id, title, status, createdAt, answeredAt)`
- `FederationInquiryDetailResponse(id, title, content, status, createdAt, closedReason, answer)` — answer=`FederationInquiryAnswerResponse(content, answeredAt, updatedAt)`. **answeredBy 제외**, 표기 "총동아리연합회" 고정
- `AdminFederationInquirySummaryResponse(id, title, status, authorName, authorStudentNo, createdAt, answeredAt)`
- `AnswerFederationInquiryRequest(content @Size(max=4000), version?)` — RECEIVED 직행 시 version 필수
- `UpdateFederationInquiryStatusRequest(status, version?, closedReason? @Size(max=200))`
- `CreateFederationFaqRequest(categoryId, question @Size(max=300), answer @Size(max=4000), pinned, published)` / `UpdateFederationFaqRequest(...)`
- `FederationFaqResponse(id, categoryId, categoryName, question, answer, pinned)` / `AdminFederationFaqResponse(+published, sortOrder, viewCount, updatedAt)`
- 서비스 계층 command/query 분리(기존 컨벤션)

### 알림 (Spring 이벤트 — 기존 인프라, `NotificationType` 3개 추가·마이그레이션 불필요)

| 이벤트 | 수신자 | dedupKey | linkUrl |
|---|---|---|---|
| `FederationInquiryReceivedEvent` | ADMIN 전원 | `federation-inquiry-received:{inquiryId}` | `/admin/inquiries/{id}` |
| `FederationInquiryAnsweredEvent` | 작성자 | `federation-inquiry-answered:{inquiryId}:{answerId}` | `/me/inquiries/{id}` |
| `FederationInquiryClosedEvent` (무답변 종결만) | 작성자 | `federation-inquiry-closed:{inquiryId}` | `/me/inquiries/{id}` |

- `@TransactionalEventListener(AFTER_COMMIT)` 리스너 → `createIfAbsent`. answered 키에 answerId 포함 — 수정 재알림 차단 유지 + P3 스레드/재오픈 확장 시 자동 동작.
- P2: RECEIVED 7일+ 관리자 리마인더 잡, 무답변 IN_PROGRESS 24~48h auto-revert 잡(FeeBillDueSoonReminderJob 패턴, env 플래그).

### 첨부파일 (P2/P3)

기존 `POST /api/v1/files` + `FilePurpose.FEDERATION_INQUIRY` 추가(매직바이트·5MB·rate limit 승계). 이미지 P2, PDF P3(FileUploadPolicy `%PDF` 시그니처 확장). 요청 body URL 배열 → attachment 기록(최대 5개).

### 예외 (static inner 패턴)

- `FederationFaqException`: `.FederationFaqNotFoundException(404)` `.FederationFaqCategoryNotFoundException(404)` `.CategoryNotEmptyException(400)`
- `FederationInquiryException`: `.FederationInquiryNotFoundException(404)` — 타인 접근도 404, `.InquiryDeletedException(410, code=INQUIRY_DELETED)` — admin 상세 전용, `.InquiryContentChangedException(409)` — version 불일치, `.InvalidInquiryStatusException(409)`, `.InquiryAlreadyAnsweredException(409)`, `.TooManyOpenInquiriesException(409)`

## 6. Frontend 구조

작업 순서(frontend/CLAUDE.md 필수): `packages/types → packages/api/src/client.ts → packages/hooks → app/[route]`

```
packages/types/src/federation.ts        타입 일체 (FederationInquiryStatus 유니온 등)
packages/api/src/client.ts              client.federationFaqs.* / client.federationFaqCategories.* /
                                        client.federationInquiries.*          (2단 — 기존 표면 규칙)
                                        client.admin.federationFaqs.* / client.admin.federationInquiries.* (3단)
                                        ※ 중간 그룹 계층(client.federation.faqs) 신설 금지 — 선례 0
packages/hooks/src/federationQueryKeys.ts
  federationFaqQueryKeys:      all ['federation-faqs'], list(filters), detail(id), categories
  federationInquiryQueryKeys:  all ['federation-inquiries'], my(filters), detail(id),
                               adminList(filters), adminDetail(id)
packages/hooks/src/federation.ts        use{FederationFaqList|FederationFaqDetail|FederationFaqCategories}Query
                                        useMyFederationInquiriesQuery, useFederationInquiryDetailQuery
                                        useCreate/Update/DeleteFederationInquiryMutation(onSuccess: invalidate)
                                        useAdminFederation* Query/Mutation
```

```
app/faq/page.tsx → _pages/FaqPage.tsx ('use client', 동적 렌더 확인 — SSG 박제 함정)
  _components/ FaqCategoryFilter(모바일 칩/데스크톱 사이드바), FaqSearchBar(draft+제출 패턴),
               FaqAccordionItem, FaqDeepLinkCard(?item= 단건 쿼리→상단 펼침, 404 시 안내),
               FaqEmptyState(1:1 문의 CTA)
  헤더 <ExploreNav slimOnMobile /> + 하단 <HomeFooter /> (HomeNav 금지 — '홈' 활성 하드코딩)
  Pagination: notices/_components 것을 app/_components로 승격 후 import (cross-route import 금지)
  metadata(title·description·canonical) + app/sitemap.ts에 /faq 추가
app/me/inquiries/page.tsx → _pages/MyInquiriesPage.tsx        상태 뱃지 리스트
app/me/inquiries/new/page.tsx → _pages/InquiryCreatePage.tsx  풀페이지 폼(모달 금지), 도배 409 안내
app/me/inquiries/[inquiryId]/page.tsx → _pages/InquiryDetailPage.tsx
  질문 카드→답변 카드 스택(답변자 "총동아리연합회" 고정), RECEIVED만 수정 버튼, 삭제 항상(확인 모달),
  IN_PROGRESS "총동연이 답변을 작성 중이라 수정할 수 없어요",
  무답변 CLOSED "답변 없이 종료된 문의입니다"+closedReason, "방학 중에는 답변이 지연될 수 있어요"
app/_components/sections/HomeQnaSection.tsx (서버) + HomeFaqAccordion.tsx ('use client')
app/_lib/home-data.ts                   fetchFederationFaqHighlights (실패 시 null→섹션 숨김)
app/admin/faqs/       _pages/AdminFaqListPage(위/아래 이동·고정·공개 토글·카테고리 관리), AdminFaqFormPage
app/admin/inquiries/  _pages/AdminInquiryListPage(상태 필터 탭+미답변 배지), AdminInquiryDetailPage
  ※ "답변 작성" CTA → status PATCH(IN_PROGRESS+version) 성공 시 폼 오픈, 409 시 refetch+배너
  ※ 답변 제출 409/410(수정·삭제·선점) 시 draft 보존 + 에러 배너
app/admin/_lib/adminSections.ts         '커뮤니티 운영' 그룹에 FAQ 관리·1:1 문의 2항목
app/_components/BottomNav.tsx           코드 무변경 + 주석에 FAQ 반영, bottom-nav.test.tsx '/faq 미노출' 테스트
app/notices/_pages/NoticePage.tsx       사이드바 "자주 묻는 질문" 링크(별도 아이콘)
app/_components/HomeFooter.tsx          문의 컬럼 재구성 — '두잉 서비스 문의'(기존 카카오·메일) vs
                                        '총동연 문의'(자주 묻는 질문·1:1 문의) 분리(채널 오배송 방지)
app/me/_pages/MyPage.tsx                '내 문의' 요약 블록
```

- **상태관리**: 서버 상태 전부 React Query(useEffect 페칭 금지), 폼 로컬 useState, Zustand 추가 없음. FAQ 필터 URL searchParams 동기화(ClubExplorePage 패턴), 필터/페이지 변경 시 `?item=` 제거.
- **UX Flow**: 발견(홈/공지/Footer) → /faq 자기해결 → 미해결 시 "원하는 답을 못 찾으셨나요? 1:1 문의하기" → 로그인 체크(next= toLinkRoute) → 작성 → 토스트+목록 → (관리자: 접수 알림 → 상세 → 답변 작성 CTA=답변중 → 답변 등록) → 학생 답변 알림 → 상세 재진입(404 시 목록 폴백).
- **Empty**: FAQ 무결과 "검색 결과가 없어요"+문의 CTA / 내 문의 0건 "아직 문의 내역이 없어요"+FAQ CTA. **Loading/Error**: 기존 인라인 텍스트 컨벤션("불러오는 중…" / "…불러오지 못했습니다") — 스켈레톤 미도입.
- **Mobile**: /faq 검색바+가로 칩(탭바 숨김, ExploreNav+Footer로 동선), 작성 풀페이지+sticky 제출, admin 기존 Sheet 패턴. P2 드래그 정렬 시 dnd-kit `<img>` draggable=false 가드.

## 7. 권한 설계

| 행위자 | 구현 | FAQ | 문의 |
|---|---|---|---|
| 비로그인 | permitAll (정확 경로 3개만) | 공개 조회/검색 | 불가 (CTA→로그인) |
| 학생(STUDENT) | `isAuthenticated()` + 서비스 소유권 검증 | 공개 조회 | 본인 것만 — 수정 RECEIVED만, 삭제 항상 |
| 총동연(ADMIN) | `hasRole('ADMIN')` 클래스 레벨 | 전체 CRUD·정렬·공개·카테고리 | 전체 조회·답변·종결 |

- 3층 방어(기존 컨벤션): SecurityConfig(정확 경로) → @PreAuthorize → 서비스 소유권 검증(작성자 아니면 404).
- 학생 경로는 순수 작성자 전용('or ADMIN' 분기 없음 — 관리자 컨트롤러 물리 분리 원칙).
- 검증 테스트 필수: 익명→문의 401, 타학생→404, STUDENT→admin 403.
- 장기: 총학/총동연 분리 시 UserRole 값 추가 + JWT/미들웨어 반영이 유일한 확장 지점.

## 8. 구현 우선순위

**P1 (MVP, PR 6개)** — PR 단위는 '1 API=1 PR' 원칙보다 큰 기능 단위(최근 커밋 관행). **P1 전부 develop 머지 후 하나의 릴리스로만 main 반영.**

1. `V73` + FAQ 공개 API (목록/단건/카테고리 + SecurityConfig 정확 경로)
2. FAQ admin API (CRUD + PUT order + 카테고리 생성·수정·순서)
3. `V74` + 문의 백엔드 (학생 5종 + admin 5종 + 알림 3종 + version echo + 조건부 갱신 + 도배 가드 이중화 + INQUIRY_DELETED)
4. FAQ 프론트 (/faq + 홈 섹션 + admin FAQ 관리 + Pagination 승격 + sitemap/metadata)
5. 문의 프론트 (학생 3페이지 + /me 블록 + admin 2페이지)
6. 진입점 마무리 ('/faq 미노출' 테스트 + 공지 링크 + Footer 재구성 + ExploreNav 헤더 확인)

**P2** (우선순위순):
1. Helpful 피드백 "도움이 되었나요?" — 카운트 비공개(admin 갭 신호 전용), 로그인 userId dedup/비로그인 세션 dedup
2. 무결과 검색어 로깅 — P1 ILIKE 검색 위에 얹음, FAQ 갭 발견 직접 신호
3. 답변 소요시간 표시 — 중앙값, 최근 90일 표본 5건 미만 미표시, "최근 문의는 보통 N일 내 답변되었어요"(과거형), 집계는 삭제 포함
4. 조회수(+POST /view) — 홈 섹션 보충 로직에만(목록 정렬 옵션은 P3)
5. 이미지 첨부, 드래그 정렬, RECEIVED 7일+ 리마인더 잡, 무답변 IN_PROGRESS auto-revert 잡(env 플래그), 카테고리 삭제(+FAQ 일괄 이관 moveToCategoryId), admin 검색 고도화, in_progress_by "작성 중" 표시

**P3**: PDF 첨부, 문의→FAQ 승격 UX(프리필+PII 체크리스트 — ①② 신호 주 N건 초과 시 P2.5 앞당김 트리거, 그 전엔 admin 수동 작성), pg_trgm, 조회수 목록 정렬, 재오픈, ANSWERED 자동 종결 배치, 만족도 평가, Role 분리, NAV_TABS 상수화, /faq/[id] SEO 승격, '삭제 포함 보기' 토글, 문의 본문+notification 파기 배치

## 9. 장기 확장 방향

- **문의→FAQ 승격 플라이휠**: 답변완료 문의를 개인정보 제거 후 FAQ 전환 — FAQ가 실제 질문 데이터로 자람
- 답변 스레드화: partial unique 제거 + author_type (알림 dedupKey가 answerId 포함이라 호환)
- 공개 Q&A 게시판(비밀 해제 옵션), 만족도 평가, 이메일 채널
- 총학생회 확장: FAQ 출처 세그먼트(SCHOOL|CLUB 패턴 복제), federation→organization 일반화
- FAQ SEO: 유입 실측 후 /faq/[id] 승격 + FAQPage JSON-LD

## 구현 체크리스트 (리스크 지점)

- [ ] SecurityConfig permitAll 정확 경로 3개만 + 익명→문의 401 테스트
- [ ] status PATCH version echo — stale-render 409 테스트(학생 수정 후 전이 시도)
- [ ] 답변 POST: RECEIVED 직행 echo 필수 / 조건부 갱신(삭제·선점 409) / FE draft 보존 / 알림 커밋 종속
- [ ] 동시 전이 낙관락 catch→재조회 204 수렴(LeaderSuccession 전례)
- [ ] @SQLDelete version 조건 + 삭제 vs 답변 레이스 통합테스트
- [ ] 도배 가드 (b) 24h 카운트는 soft delete 포함 네이티브 쿼리
- [ ] 집계 쿼리 deleted_at 명시 조건(@SQLRestriction 암묵 의존 금지)
- [ ] admin 목록 leftJoin users + 탈퇴 회원 표기 + count 조인 일치
- [ ] bottom-nav.test.tsx '/faq 미노출' 회귀 테스트
- [ ] /faq 헤더 ExploreNav(HomeNav 금지) + HomeFooter + 동적 렌더 확인
- [ ] 알림 linkUrl 404/410 폴백
- [ ] 홈 섹션 BE 장애 시 숨김 + 주석
- [ ] 테스트 날짜는 상대 날짜 사용(하드코딩 미래 절대날짜 금지 — CI 타임밤)
