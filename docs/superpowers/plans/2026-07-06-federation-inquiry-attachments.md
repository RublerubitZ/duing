# 총동연 문의 이미지 첨부 (P2-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 학생이 1:1 비밀문의 작성·수정 시 이미지 최대 5장을 첨부하고, **작성자 본인과 ADMIN만** 내려받아 볼 수 있게 한다. 스펙 §8 P2-1. PR 2개(백엔드 PR7 → 프론트 PR8).

**Architecture (핵심 설계 결정 — 조사 근거 포함):**
- **업로드는 기존 인프라 재사용**: `POST /api/v1/files`(인증·rate limit·매직바이트 이미지 전용·5MB)에 `FilePurpose.FEDERATION_INQUIRY("federation/inquiry")` 추가. 업로드 응답은 기존대로 공개 URL(작성자 본인만 수신 — 무해).
- **비밀성은 "키 비공개 + 인증 프록시 다운로드"로 확보**: 현재 스토리지(R2/로컬)는 publicBaseUrl로 버킷 전체를 공개 서빙하므로 **URL을 응답에 실으면 비밀성이 깨진다**. 따라서 ① DB에는 publicBaseUrl을 벗긴 **storage key**만 저장, ② 학생/admin 조회 응답에는 URL 없이 `attachmentId·fileName·contentType·fileSize`만 노출, ③ 원본 바이트는 `GET /api/v1/federation/inquiries/{inquiryId}/attachments/{attachmentId}`(작성자 or ADMIN)가 스토리지에서 스트리밍. 뷰어가 공개 URL을 절대 치지 않으므로 CDN 캐시(immutable 1y)도 냉장 유지. 키 유출 시 공개 접근 가능하다는 잔여 리스크는 문서화(UUID 122-bit, 응답 미노출이라 유출 벡터 없음) — 향후 프라이빗 버킷 도입 시 env만 교체하면 되는 A-ready 구조.
- **FE 렌더는 fetch+blob**: 인증이 Bearer 헤더라 `<img src=프록시>`는 인증 불가 → `fetch(Authorization)` → `URL.createObjectURL(blob)`. 작성 폼 미리보기는 업로드 전 로컬 blob 사용(공개 URL 미사용).
- **첨부는 질문 측만**(answer_id 슬롯은 스키마에 유지, 후속). 수정(RECEIVED만)은 전체 교체(PUT 의미론 — ClubPhoto 전례), 교체로 제거된 파일은 스토리지에서 즉시 삭제(고아 방지). 문의 삭제 시 attachment soft delete만(스토리지 파기는 P3 파기 배치 몫).

**Tech Stack:** Spring Boot 3.4 / Flyway V75 / S3 SDK v2 getObject 스트리밍 / Next.js 15 / TanStack Query

**레퍼런스(구현 전 필독):**
- `global/file/` 전체 — FileStorageService·S3FileStorageService·LocalFileStorageService·FileUploadPolicy·FileController
- `domain/federation/` — FederationInquiry 엔티티·GeneralFederationInquiryService·FederationInquiryController·인수 테스트
- FE: `client.ts` files.upload(273·777행), `app/manage/clubs/[clubId]/photos/_components/PhotoUploader.tsx`(업로드 UX 전례), `app/me/inquiries/**`

---

## PR7 — backend (`feat/federation-inquiry-attachment-api`)

### Task 1: V75 마이그레이션 + 엔티티 + FilePurpose

**Files:**
- Create: `backend/src/main/resources/db/migration/V75__create_federation_inquiry_attachment.sql`
- Create: `backend/src/main/java/com/duing/domain/federation/entity/FederationInquiryAttachment.java`
- Modify: `backend/src/main/java/com/duing/global/file/controller/dto/FilePurpose.java`
- Create: `backend/src/main/java/com/duing/domain/federation/repository/FederationInquiryAttachmentRepository.java`

- [ ] **Step 1: V75 작성** — 스펙 §4 스키마 그대로. `ENABLE ROW LEVEL SECURITY` 필수(RowLevelSecurityMigrationTest가 잡음):

```sql
CREATE TABLE federation_inquiry_attachment (
    id           BIGSERIAL PRIMARY KEY,
    inquiry_id   BIGINT       NOT NULL REFERENCES federation_inquiry (id),
    answer_id    BIGINT       REFERENCES federation_inquiry_answer (id),  -- 답변 측 첨부 슬롯(후속)
    storage_key  VARCHAR(500) NOT NULL,  -- 공개 URL 이 아닌 스토리지 키. 비밀성: URL 은 응답에 절대 노출하지 않는다
    file_name    VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    file_size    BIGINT       NOT NULL,
    sort_order   INT          NOT NULL DEFAULT 0,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMP
);
CREATE INDEX idx_fed_inquiry_attachment_inquiry ON federation_inquiry_attachment (inquiry_id) WHERE deleted_at IS NULL;
ALTER TABLE federation_inquiry_attachment ENABLE ROW LEVEL SECURITY;
```

(스펙의 `file_url`을 `storage_key`로 의미 확정 — Architecture 결정 반영)

- [ ] **Step 2: 엔티티** — BaseEntity 미상속(Notification 전례, 수정 불가 리소스), `@SQLDelete`+`@SQLRestriction` soft delete, `@Builder` private 생성자, LAZY. 필드: inquiry(ManyToOne), answerId(Long, nullable — 연관 대신 id 슬롯), storageKey, fileName, contentType, fileSize, sortOrder, createdAt(`@CreationTimestamp`), deletedAt
- [ ] **Step 3: FilePurpose에 `FEDERATION_INQUIRY("federation/inquiry")` 추가**
- [ ] **Step 4: Repository** — `List<FederationInquiryAttachment> findAllByInquiryIdOrderBySortOrderAsc(Long inquiryId)`
- [ ] **Step 5:** `cd backend && ./gradlew test --tests "*RowLevelSecurity*" --tests "*Migration*"` PASS → Commit `feat(backend): 문의 첨부 테이블·엔티티 추가 (V75)`

### Task 2: 생성·수정 API 첨부 연동

**Files:**
- Modify: `CreateFederationInquiryRequest` / `UpdateFederationInquiryRequest`(+command 2종), `GeneralFederationInquiryService`, `FederationInquiryDetailResponse`, `AdminFederationInquiryDetailResponse`(+api 인터페이스 Swagger)

**계약:**
- 요청에 `attachmentUrls`(List\<String\>, `@Size(max=5, message="첨부는 최대 5개까지 등록할 수 있습니다.")`, nullable) 추가. FE는 업로드 API가 돌려준 공개 URL을 그대로 실어 보낸다.
- 서비스에서 URL → key 변환·검증: publicBaseUrl(로컬은 LocalFileStorageService의 base) 프리픽스를 벗기고, **키가 `federation/inquiry/` 프리픽스가 아니면 400**(`InvalidInquiryException` 재사용, 메시지 "유효하지 않은 첨부 파일입니다."). 변환 로직은 `FileStorageService`에 `String toStorageKey(String fileUrl)`(프리픽스 불일치 시 null) 추가해 위임 — Local·S3 각자 base 기준으로 구현.
- create: 문의 저장 후 attachment 일괄 저장(sort_order = 배열 순서). update(RECEIVED만): **전체 교체** — 기존 목록과 diff, 제거된 것은 soft delete + `fileStorageService.delete(재조립 URL)` 즉시 호출(고아 방지), 새 것은 insert. `attachmentUrls == null`이면 기존 유지(부분 갱신 관례 — clear-intent 규약: 비우기는 빈 배열 `[]`).
- 응답: Detail 2종(학생·admin)에 `attachments: List<AttachmentResponse(id, fileName, contentType, fileSize)>` — **URL 필드 금지**.

- [ ] **Step 1:** request/command/응답 record 확장(계층 4~5곳 positional 동기화 주의 — clear-intent 메모리 전례)
- [ ] **Step 2:** FileStorageService `toStorageKey` + Local/S3 구현
- [ ] **Step 3:** 서비스 create/update 연동(위 계약), Detail 응답 조립에 repository 조회 추가
- [ ] **Step 4:** 인수 테스트(FederationInquiryAcceptanceTest에 추가): ① 첨부 3개 생성→학생 상세에 id·fileName만 노출(URL 미노출 단언) ② 6개 → 400 ③ 타 purpose URL(`club/logo/...`) → 400 ④ RECEIVED 수정으로 1개 제거+1개 추가 → 목록 교체 확인 ⑤ `attachmentUrls` 미포함 수정 → 기존 유지 → Commit `feat(backend): 문의 생성·수정 첨부 연동`

### Task 3: 인증 다운로드 엔드포인트

**Files:**
- Modify: `FileStorageService`(+`StoredFile download(String storageKey)` — record StoredFile(InputStream stream, String contentType, long contentLength)), `LocalFileStorageService`, `S3FileStorageService`
- Modify: `FederationInquiryApi`/`FederationInquiryController`, `GeneralFederationInquiryService`

**계약:**
- `GET /api/v1/federation/inquiries/{inquiryId}/attachments/{attachmentId}` — `@PreAuthorize("isAuthenticated()")`, 서비스에서 **작성자 본인 or ADMIN** 검증(불일치·미존재·soft deleted 전부 404 — 존재 은닉, 학생 경로 관례). admin도 같은 엔드포인트 사용(별도 admin 경로 불필요 — 권한 분기만).
- 응답: `ResponseEntity<InputStreamResource>` + Content-Type(저장값)·Content-Length·`Content-Disposition: inline; filename*=UTF-8''인코딩파일명`·`X-Content-Type-Options: nosniff`·`Cache-Control: private, max-age=300`(브라우저 개인 캐시만 허용).
- S3 구현: `s3Client.getObject(GetObjectRequest)` → ResponseInputStream 그대로(try-with-resources 금지 — 스트리밍 응답). `NoSuchKeyException` → 404. Local: 파일 경로 검증(base 밖 탈출 금지 — `Path.normalize().startsWith(base)`) 후 FileInputStream.

- [ ] **Step 1:** FileStorageService download + 구현 2종(Local 경로 탈출 가드 포함)
- [ ] **Step 2:** 컨트롤러/서비스 — 권한 검증(작성자 or ADMIN) 후 attachment 조회 → download 스트리밍
- [ ] **Step 3:** 인수 테스트: ① 작성자 다운로드 200+Content-Type ② ADMIN 200 ③ 타 학생 404 ④ 비로그인 401 ⑤ 삭제된 문의의 첨부 404 (MinIO Testcontainer — 기존 파일 인수 테스트 전례 활용)
- [ ] **Step 4:** 전체 검증 `cd backend && ./gradlew build` BUILD SUCCESSFUL 확인(출력에서 직접, `| tail` 금지) → Commit `feat(backend): 문의 첨부 인증 다운로드 API`

### Task 4 (PR7 게이트): duing-code-reviewer + codex adversarial(비밀성: URL 미노출·권한 검증·경로 탈출·타 purpose 키 주입) → 반영 → push → PR

---

## PR8 — web (`feat/federation-inquiry-attachment-web`) — PR7 머지 후

### Task 5: 데이터 레이어

- [ ] `packages/types/federationInquiry.ts`: `FederationInquiryAttachment{id,fileName,contentType,fileSize}` + Detail 2종에 `attachments: FederationInquiryAttachment[]`, payload 2종에 `attachmentUrls?: string[]`
- [ ] `client.ts`: `federationInquiries.downloadAttachment(inquiryId, attachmentId): Promise<Blob>`(ky `.blob()` — json 파싱 경로와 구분), FilePurpose 타입에 `FEDERATION_INQUIRY` 추가
- [ ] hooks: `useFederationInquiryAttachmentQuery(inquiryId, attachmentId)`(staleTime 5분, blob 반환) — 상세 쿼리와 별도 키 `federationInquiryQueryKeys.attachment(inquiryId, attachmentId)`
- [ ] typecheck·lint → Commit `feat(web): 문의 첨부 타입·다운로드 클라이언트 추가`

### Task 6: 작성·수정 폼 업로더 + 상세 표시

- [ ] **업로더**(`app/me/inquiries/_components/InquiryImageUploader.tsx`): PhotoUploader 전례 준용 — 파일 선택(accept="image/*", 다중) → `api.files.upload(file, 'FEDERATION_INQUIRY')` 순차 업로드 → `{url, previewObjectUrl}` 목록 state, 최대 5 초과 시 토스트, 항목 삭제(X), **로컬 blob 미리보기**(공개 URL로 <img> 금지), `<img draggable={false}>`(dnd 메모리 가드), objectURL revoke 정리
- [ ] InquiryCreatePage·InquiryDetailPage 편집 모드에 업로더 통합 — payload에 `attachmentUrls` 포함(편집 시드는 기존 첨부를 **다운로드 blob으로 미리보기 + 기존 항목은 서버 URL 재전송 불가하므로**: 기존 첨부는 `{attachmentId, fileName}` 뱃지로 유지/삭제만 가능, 새 첨부만 업로드 — 유지 항목은 attachmentUrls에 어떻게 실을지 문제 → **수정 계약 단순화: 기존 유지 시 attachmentUrls 미전송(null=유지), 첨부를 바꾸려면 전체 재업로드**. 폼 UX: "첨부를 변경하면 기존 첨부는 모두 교체됩니다" 안내. YAGNI — 부분 유지·삭제 조합은 후속)
- [ ] **상세 표시**(학생 `InquiryDetailPage`·admin `AdminInquiryDetailPage`): `attachments.map` → `AttachmentImage` 컴포넌트(useFederationInquiryAttachmentQuery → objectURL → <img>, 로딩 스켈레톤, 실패 시 fileName 텍스트 폴백). 클릭 시 새 탭 원본(objectURL) 열기
- [ ] typecheck·lint·build → Commit `feat(web): 문의 첨부 업로드·표시`

### Task 7: 테스트 + 게이트

- [ ] vitest: 업로더(5개 초과 거부·삭제), 작성 제출 payload에 attachmentUrls, 상세 attachments 렌더(blob mock), admin 상세 표시 — 4~6케이스
- [ ] 검증 4종 + 시각 QA(leader 계정: 첨부 3장 작성→상세 표시→새 탭→수정 교체→삭제, admin 스킵 전례) + FE 리뷰 + codex(비밀성: 공개 URL DOM 미노출 단언 포함) → 반영 → push → PR

---

## Out of Scope
- 답변 측 첨부(answer_id 슬롯만 존재), PDF(P3), 프라이빗 버킷 이전(ops 후속 — 코드는 A-ready), 스토리지 물리 파기 배치(P3), 수정 시 기존 첨부 부분 유지·조합(전체 교체만), 다운로드 rate limit

## Self-Review
- 스펙 §4 attachment 스키마 ↔ V75 정합(file_url→storage_key 의미 확정은 Architecture에 근거 기록). 비밀성 계약(URL 미노출·인증 프록시·CDN 캐시 냉장)이 백엔드 응답·FE 렌더·테스트 단언까지 일관되게 이어짐. 수정 계약(null=유지/[]=비움/배열=교체)은 clear-intent 규약과 정합. FE 편집 UX는 "전체 교체" 단순화로 YAGNI 준수 — 계약 모순 없음.
