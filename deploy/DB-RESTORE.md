# DB 백업 · 복원 (Supabase prod → R2)

운영 DB 는 Supabase prod 한 곳이다. GitHub Actions 가 매일 논리 백업을 떠서 Cloudflare R2 에 올리고,
복원은 받아온 덤프를 `psql` 로 되먹이는 방식이다. 백엔드 배포·롤백은 [`README.md`](./README.md),
장애 감지·1차 분류는 [`UPTIME.md`](./UPTIME.md) 를 참조한다.

> **복원 전에 반드시 읽을 것**: 이 DB 에는 재실행하면 데이터를 망가뜨리는 **비멱등 마이그레이션**(V112·V113)이
> 적용돼 있다. 스냅샷 시점에 따라 조치가 갈리므로 맨 아래 **부록 A** 를 먼저 확인한다.

## 백업 파이프라인

`.github/workflows/backup.yml` — `schedule` + `workflow_dispatch`.

| 항목 | 값 |
|---|---|
| 주기 | cron `15 19 * * *` (UTC) = **매일 04:15 KST** |
| 도구 | Supabase CLI(`supabase/setup-cli`, version `latest`) |
| 산출물 | `roles.sql`(`--role-only`) · `schema.sql`(기본) · `data.sql`(`--data-only --use-copy`, storage 벡터 테이블 2개 제외) — 전부 gzip |
| 검증 | `gzip -t` 무결성 + `data.sql.gz` 가 10KB 이하이면 **잡 실패**(빈 덤프 방지) |
| 업로드 | `s3://$R2_BUCKET/YYYY/MM/DD/` — 날짜는 **KST 기준**(`TZ=Asia/Seoul date`) |
| 시크릿 | `SUPABASE_DB_URL`(Session Pooler 문자열) · `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` · `R2_BUCKET` · `R2_ENDPOINT` |

- `SUPABASE_DB_URL` 은 **Session Pooler** 주소를 쓴다. Supabase Direct 연결은 IPv6 이고 GitHub 러너는
  IPv4 전용이라 접속 자체가 되지 않는다.
- R2 는 AWS CLI v2.23+ 의 기본 체크섬을 거부하므로 업로드·다운로드 양쪽에서
  `AWS_REQUEST_CHECKSUM_CALCULATION=when_required` / `AWS_RESPONSE_CHECKSUM_VALIDATION=when_required` 가 필요하다.
- 보관 기간은 R2 버킷의 라이프사이클 규칙에 달려 있다(레포가 아니라 Cloudflare 콘솔 설정 — 오래된 스냅샷이
  필요하면 남아 있는지부터 확인한다).

**수동 백업**은 파괴적 마이그레이션(컬럼 DROP, 백필)이 포함된 릴리스 직전의 표준 절차다.

```bash
gh workflow run backup.yml            # Actions → Database Backup → Run workflow 와 동일
gh run watch                          # 성공 확인 후 릴리스 진행
```

## 표준 복원 절차 (Supabase → Supabase)

논리 덤프 복원이라 **전체 시점 복원**만 한다. "일부 테이블만 어제 것으로" 같은 혼합 복원은
아래 부록의 백필 정합성을 깨뜨리므로 금지한다.

### 1. 앱을 먼저 멈춘다

복원 중에 백엔드가 살아 있으면 Flyway 와 애플리케이션 쓰기가 덤프와 뒤섞인다.

```bash
# Lightsail 배포 디렉터리에서
docker compose stop backend
```

### 2. 스냅샷 내려받기

```bash
export AWS_ACCESS_KEY_ID=...           # R2_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY=...       # R2_SECRET_ACCESS_KEY
export AWS_DEFAULT_REGION=auto
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

aws s3 ls "s3://$R2_BUCKET/2026/08/" --recursive --endpoint-url "$R2_ENDPOINT"
aws s3 cp "s3://$R2_BUCKET/2026/08/22/" ./restore/ --recursive --endpoint-url "$R2_ENDPOINT"

cd restore
gzip -t ./*.sql.gz && gunzip ./*.sql.gz
```

폴더 날짜는 KST 다. UTC 19:15 에 돈 잡이 **다음 날짜** 폴더에 들어가므로, 사고 시각 직전 스냅샷을 고를 때
하루 어긋나기 쉽다.

### 3. 되먹이기 — `roles` → `schema` → `data`

순서가 계약이다. 롤이 없으면 스키마의 소유자·권한 구문이 깨지고, 스키마가 없으면 데이터가 들어갈 곳이 없다.

```bash
# TARGET_DB_URL = 복원 대상 DB 의 Postgres 연결 문자열. prod 를 제자리 복원하는 경우 backup.yml 이 덤프에 쓰는
# 시크릿 SUPABASE_DB_URL(Supabase Session Pooler)과 같은 대상이고, 다른 프로젝트로 되살리면 그쪽 값을 넣는다.
# Pooler 경유로 이 적재가 끝까지 되는지(안 되면 Direct 연결)는 아래 ⚠️ 리허설에서 실측 확정한다.
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$TARGET_DB_URL"
```

- `session_replication_role = replica` 는 데이터 적재 동안 트리거·FK 검사를 비활성화한다. 덤프의 COPY 순서가
  FK 위상을 따르지 않기 때문에 이게 없으면 참조 오류로 멈춘다.
- `--single-transaction` + `ON_ERROR_STOP=1` 이라 중간 실패 시 전부 롤백된다 — 반쯤 복원된 DB 가 남지 않는다.
- ⚠️ **이 명령 조합은 아직 실복원으로 검증되지 않았다**(덤프 3파일 구성에 맞춘 표준형이다). 특히
  `SET session_replication_role = replica` 는 접속 계정의 권한에 따라 거부될 수 있다 — 장애 한복판에서
  처음 시도하지 말고, **첫 실복원 전에 별도 DB 로 리허설을 한 번 돌려** 이 절 전체를 실측으로 갱신한다.
- 대상이 **비어 있지 않다면** 먼저 비운다. 기존 데이터 위에 덧씌우는 복원은 PK 충돌로 실패하거나,
  통과하더라도 두 시점의 행이 섞인다.

### 4. 바닐라 Postgres 로 복원할 때 (2026-07-17 실검증)

Supabase 가 아니라 일반 Postgres(로컬 검증용 등)에 되살릴 때만 해당한다. 함정이 네 가지다.

- `roles.sql` 에는 `ALTER` 만 들어 있다 → `anon` / `authenticated` / `service_role` / `authenticator` 롤과
  `extensions` · `vault` 스키마를 **미리 만들어 둬야** 한다.
- `schema.sql` 적용 중 `supabase_vault` 확장 없음, `supabase_realtime` publication 없음 오류 2건은 무해하다
  (Supabase 플랫폼 전용).
- `data.sql` 에는 `auth.*` · `storage.*` COPY 블록이 들어 있다 → 바닐라 PG 에서는 `public` 스키마만 남기고 걸러낸다.
- Supabase → Supabase 복원이면 위 셋 다 해당 없이 그대로 쓴다.

### 5. 복원 후 확인

```sql
-- 어느 시점까지 마이그레이션이 적용된 스냅샷인지 (부록 A 의 분기 판단 근거)
SELECT version, description, installed_on, success
FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;
```

그다음 백엔드를 올린다. 부팅 시 Flyway 가 스냅샷 버전 이후의 마이그레이션을 자동 적용하므로,
**올리기 전에 부록 A 를 확인**한다.

```bash
docker compose up -d
docker compose logs -f backend           # Flyway 적용 로그 확인
curl -s https://api.duings.com/actuator/health
```

마지막으로 회비·면접 화면에서 시각 표기가 맞는지, 최근 지원·결제가 보이는지 눈으로 확인한다.

## 부록 A — V112/V113 비멱등 백필

타임존 2단계에서 `timestamptz` 4컬럼의 저장 왜곡(+9h)을 `- interval '9 hours'` 로 정정했다.
**뺄셈이라 두 번 돌면 −18h 가 된다.** 정상 배포 경로에서는 Flyway 가 1회만 적용하므로 문제가 없고,
위험은 오직 **복원**과 **수동 SQL 재실행** 두 경로뿐이다. 배경은
[`../TIMEZONE.md`](../TIMEZONE.md) "2단계: DB 마이그레이션 계획" 4항(환경 분기)·5항(롤백 시 재왜곡 창) 참조.

| 항목 | V112 | V113 |
|---|---|---|
| 파일 | `V112__tz_stage2_fee_bank_backfill.sql` | `V113__tz_stage2_interview_backfill.sql` |
| prod 적용 | 2026-08-22 릴리스(main `5455ffd7`) — 둘이 **같은 릴리스**로 도달했다 | 좌동 |
| 대상 컬럼 | `payment.paid_at`(NOT NULL) · `payment.voided_at`(nullable) · `bank_transaction.transaction_at`(NOT NULL) | `interview_round.assignment_completed_at`(nullable) |
| 보정 | `- interval '9 hours'` | 동일 |
| 실행 조건 | Flyway placeholder `${apply_tz_backfill}` — `application-prod.yml` 만 `"true"`, 공통·테스트 `application.yml` 은 `"false"`(WHERE 절이 거짓이라 no-op) | 동일(V112 인프라 재사용) |
| 왜곡 시 가시 신호 | 회비 화면 시각이 일제히 9h 어긋남 | 공개 활동 피드의 면접 확정 시각이 9h 어긋남 |

placeholder 를 정의하지 않은 환경은 부팅 단계에서 즉시 실패한다(조용한 누락 없음). 체크섬은 치환 전 원문
기준이라 환경 간 불일치도 생기지 않는다.

### 복원 시 분기 (3가지)

위 5절의 `flyway_schema_history` 조회 결과로 판단한다.

1. **최대 버전 ≥ 113** — 스냅샷 데이터에 보정이 이미 반영돼 있다. 재기동해도 Flyway 가 다시 적용하지 않는다.
   **추가 조치 없음.**
2. **최대 버전 < 112** — 스냅샷 데이터는 왜곡 상태이고, 그게 **정상**이다(당시 코드와 정합). 재기동 시
   V112·V113 이 1회 적용되며 이것이 올바른 경로다. 손대지 말고 그냥 올린다.
3. **혼합 복원** — 스냅샷(<112)에 그 이후 신코드가 쓴 행이 섞여 들어간 상태. 섞인 행은 이미 정합이라
   백필이 −18h 로 망가뜨린다. **이 복원은 하지 않는다** — 전체 시점 복원만 한다.

### 검증 SQL (복원·재기동 후)

최근 행의 시각이 실제 발생 시각(KST 업무시간대가 자연스럽다)과 맞는지 본다. 9h 어긋나 있으면 미적용,
18h 어긋나 있으면 이중 적용이다.

```sql
SELECT max(paid_at) FROM payment;
SELECT max(transaction_at) FROM bank_transaction;
SELECT max(assignment_completed_at) FROM interview_round;
```

### 실패·롤백 대응

- **마이그레이션 실패** = 부팅 실패 = 배포 자동 롤백. 각 마이그레이션은 트랜잭션이라 부분 적용이 남지 않는다.
- **백필 적용 후 앱만 구버전으로 롤백**하면, 롤백 창 동안 구코드(KST 벽시계 저장)가 쓴 행만 다시 +9h 로
  왜곡되어 한 컬럼에 두 regime 이 섞인다. 이때 V112·V113 은 재실행되지 않는다. 복구는 **그 창에 들어온 행만**
  표적 보정하는 것이다 — 창 경계는 배포 로그 타임스탬프와 행의 `created_at` 으로 잡는다.
  전 구간에 다시 `- interval '9 hours'` 를 돌리면 정상 행까지 −18h 가 된다.
- 백필 마이그레이션은 되돌릴 스크립트가 없다. **선행 백업이 전제**다(위 "수동 백업").
