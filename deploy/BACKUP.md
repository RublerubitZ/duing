# DB 백업 · 복구 런북 (RTO/RPO)

> 출시 감사 지적 2번(RTO/RPO·백업·복원 훈련 부재)의 대응 문서. 백업 파이프라인과 복원 리허설은
> 2026-07 에 구축·검증 완료 — 이 문서는 목표 수치와 절차를 명문화한다.

## 목표 (승인: 2026-07-24)

| 항목 | 목표 | 근거 |
|------|------|------|
| **RPO** (허용 데이터 손실) | **최대 24시간** | 일일 백업 주기(04:15 KST)와 일치. 지원서·회비 데이터 특성상 수용 가능 판단 |
| **RTO** (허용 복구 시간) | **최대 4시간** | 리허설 실측(수십 분) 대비 여유 포함 — 신규 프로젝트 생성·DNS·검증 시간 포함 |
| 리허설 주기 | **분기 1회** | 절차 부패 방지. 마이그레이션 큰 변경(스키마 대개편) 후에는 추가 1회 |
| 책임자 | 운영 계정 보유자(현재 1인 운영) | Supabase·R2·GitHub Secrets 접근 권한 필요 |

- RPO 를 수분 단위로 줄여야 하는 시점(결제·실시간 데이터 도입 등)에 Supabase PITR(월 ~$100)을 재평가한다.

## 백업 체계 (자동, 가동 중)

- **무엇을**: Supabase prod DB — roles(`roles.sql`) + 스키마(`schema.sql`) + 데이터(`data.sql`, COPY 포맷,
  `storage.buckets_vectors`·`storage.vector_indexes` 제외) 3종. gzip 압축.
- **언제**: 매일 **04:15 KST** (`.github/workflows/backup.yml`, cron `15 19 * * *` UTC).
- **어디로**: Cloudflare R2 — `s3://<R2_BUCKET>/YYYY/MM/DD/` (KST 날짜 경로).
- **무결성 검증**: 워크플로가 gzip 무결성 + `data.sql.gz` 최소 크기(>10KB)를 자동 확인. 실패 시 워크플로 실패로 표면화.
- **주의**: 덤프는 **Session Pooler URL** 필수(Direct 연결은 IPv6 이슈). Secrets: `SUPABASE_DB_URL`, `R2_*`.
- **백업 실패 감지**: GitHub Actions 실패 알림(레포 watch) — 3일 연속 실패 시 수동 점검 필수.

## 복원 절차 (리허설 검증본 요약)

> 시나리오: Supabase prod 프로젝트 손실/오염 → 새 Supabase 프로젝트로 복원.

1. **복원 대상 확보**: R2 에서 최신 정상 날짜의 `roles.sql.gz`·`schema.sql.gz`·`data.sql.gz` 다운로드 → `gunzip`.
2. **새 Supabase 프로젝트 생성** (region 동일) → **Session Pooler** 연결 문자열 확보.
3. **롤 선생성**: `psql <pooler-url> -f roles.sql`
   — Supabase 관리 롤(`supabase_admin` 등) 관련 오류는 무시 가능(이미 존재). 앱 전용 롤이 생성되는지만 확인.
4. **스키마 복원**: `psql <pooler-url> -f schema.sql`
   — `auth`·`storage` 스키마 객체 충돌 오류는 새 프로젝트에 기본 존재하므로 무시 가능(리허설 검증됨).
5. **데이터 복원**: `psql <pooler-url> -f data.sql` (COPY 기반 — 대량이어도 수 분 내).
6. **앱 전환**: 백엔드 `.env` 의 DB URL 을 새 프로젝트 pooler 로 교체 → `docker compose up -d` → 헬스 확인.
7. Storage(R2 이미지)는 DB 와 무관하게 보존되므로 별도 조치 불필요(URL 불변).

## 복원 후 검증 체크리스트 (필수)

- [ ] `select count(*)` 스팟 체크: `users`, `club`, `application`, `fee_bill` — 백업 시점 예상 규모와 대조
- [ ] Flyway 이력 확인: `select max(version) from flyway_schema_history` — 백업 시점 버전과 일치
- [ ] 백엔드 기동 성공 + `/actuator/health/readiness` UP (DB 연결 포함)
- [ ] 실계정 로그인 → 동아리 상세 → 지원 내역 조회 (읽기 경로)
- [ ] 운영진 콘솔 쓰기 1건(공지 작성 등) 후 삭제 (쓰기 경로)
- [ ] Better Stack 모니터 4종 전부 Up 복귀 확인 ([`UPTIME.md`](./UPTIME.md))

## 리허설 기록

| 일자 | 범위 | 결과 |
|------|------|------|
| 2026-07 (V81~V85 시점) | R2 백업본 → 신규 프로젝트 전체 복원 | 통과 — 롤 선생성·auth/storage 충돌 무시 절차 확립 |
| (다음: 2026-10 예정) | 분기 리허설 | — |
