# 외부 Uptime 모니터링 · 장애 알림

> 출시 감사 지적 12번("장애가 나도 모른다")의 최소선. 외부 모니터가 프로덕션 가용성을 감시하고,
> 실패 시 알림 채널로 즉시 통지한다. 서버 내부 관측(request ID·메트릭)은 별도 후속.

## 모니터 구성 (3종)

| # | 이름 | URL | 방식 | 주기 | 성공 조건 |
|---|------|-----|------|------|-----------|
| 1 | BE Health | `https://api.duings.com/actuator/health` | HTTP GET + 키워드 | 1~3분 | 200 + 본문에 `"UP"` |
| 2 | BE API 실질 | `https://api.duings.com/api/v1/clubs?size=1` | HTTP GET + 키워드 | 3분 | 200 + 본문에 `"ok":true` |
| 3 | FE | `https://duings.com/` | HTTP GET | 3분 | 200 |

- **1번**은 프로세스·DB 연결(readiness 포함)을, **2번**은 Caddy→앱→DB 실쿼리 경로 전체를, **3번**은 Vercel 서빙을 본다.
  2번이 죽고 1번이 살아 있으면 앱 내부(쿼리·직렬화) 문제, 둘 다 죽으면 VM/Caddy/네트워크 문제로 1차 분류할 수 있다.
- 기준 응답시간(2026-07-24 실측): health ~1.2s, clubs API ~1.2s, FE ~0.5s.

## 알림 정책

- **다운 판정**: 2회 연속 실패 시 알림(순간 플랩 방지). 복구 시 회복 알림 필수.
- **지연 경보**(지원 시): 응답 5s 초과가 3회 연속이면 저심각 알림.
- **채널**: 이메일(기본) + Discord/Slack webhook. 모니터 1·2번(백엔드)은 즉시 알림, 3번(FE)도 즉시.
- SSL 만료 감시(제공 시 활성): api.duings.com, duings.com — 만료 14일 전 알림.

## 서비스 선택

**추천: Better Stack (Uptime)** — 무료 티어로 모니터 10개·30초~3분 주기·이메일/Slack/Discord 알림·상태 페이지 제공.
대안: UptimeRobot — 무료 50개·5분 주기(주기가 김), 구성 단순.

### Better Stack 세팅 순서 (약 10분)

1. https://betterstack.com 가입 → Uptime → Monitors → Create monitor.
2. 위 표의 3종을 각각 생성 — "Expected content" 에 키워드(`"UP"` / `"ok":true`) 입력, 주기 3분(1번은 1분 권장), "Confirmation period" 2 체크.
3. Integrations → Discord(또는 Slack) 연결 → 알림 정책에 채널 추가(이메일은 기본 on).
4. (선택) Status page 생성 후 3개 모니터 연결 — 팀 공유용.
5. 테스트: 모니터 하나를 Pause→Resume 하거나, "Send test alert" 로 채널 수신 확인.

### UptimeRobot 세팅 순서

1. https://uptimerobot.com 가입 → Add New Monitor(HTTP(s)) 3종 — Keyword 타입으로 `"UP"`/`"ok":true` 지정.
2. Alert Contacts 에 이메일 + Discord/Slack webhook 추가, 각 모니터에 연결.

> API 키를 공유해 주면 모니터 생성을 자동화할 수 있다(Better Stack·UptimeRobot 모두 REST API 제공).

## 장애 대응 런북 (알림 수신 시)

1. **재현 확인**: `curl -s https://api.duings.com/actuator/health` — 로컬에서도 실패하면 진짜 장애, 성공하면 모니터측 일시 문제(회복 알림 대기).
2. **1차 분류**:
   - 1·2번 동시 다운 → VM/Caddy/네트워크: Lightsail 콘솔에서 인스턴스 상태 확인 → SSH → `docker compose -f deploy/docker-compose.yml ps` / `docker compose logs --tail 100 caddy backend`.
   - 2번만 다운(1번 UP) → 앱/DB 쿼리 경로: backend 로그와 Sentry(backend 프로젝트) 확인, Supabase 대시보드 상태 확인.
   - 3번만 다운 → Vercel 상태(https://www.vercel-status.com) 및 배포 히스토리 확인, 필요 시 Vercel 대시보드에서 직전 배포로 Instant Rollback.
3. **복구 시도(백엔드)**: `docker compose restart backend` → 헬스 재확인. 컨테이너 자체가 기동 불가면 직전 이미지로 롤백 — `deploy/README.md` 의 롤백 절차 참조(GitHub Actions Deploy Backend 워크플로의 직전 성공 커밋 re-run).
4. **DB 의심 시**: Supabase 대시보드 → Database health. 복구 불가 수준이면 `deploy/README.md` 백업/복구 런북(R2 일일 백업, 04:15 KST) 절차로 이관.
5. **사후**: Sentry 이슈 링크와 함께 타임라인 기록(감지→분류→복구), 원인이 배포였다면 해당 커밋 명시.

## 미커버 (후속)

- 서버 내부 지표(Hikari pool·CPU/RSS·p95)와 request ID 추적 — 감사 12번 본대응.
- liveness/readiness 분리 소비(재시작 자동화) — 감사 13번(Health Check 분리).
- 5xx 비율 알림(현재는 가용성만) — Sentry alert rule 로 보완 가능.
