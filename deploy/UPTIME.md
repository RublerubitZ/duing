# 외부 Uptime 모니터링 · 장애 알림

> 출시 감사 지적 12번("장애가 나도 모른다")의 최소선. 외부 모니터가 프로덕션 가용성을 감시하고,
> 실패 시 알림 채널로 즉시 통지한다. 서버 내부 관측(request ID·메트릭)은 별도 후속.

## 모니터 구성 (5종)

| # | 이름 | URL | 방식 | 주기 | 성공 조건 |
|---|------|-----|------|------|-----------|
| 1 | BE Health | `https://api.duings.com/actuator/health` | HTTP GET + 키워드 | 1~3분 | 200 + 본문에 `"UP"` |
| 2 | BE API 실질 | `https://api.duings.com/api/v1/clubs?size=1` | HTTP GET + 키워드 | 3분 | 200 + 본문에 `"ok":true` |
| 3 | FE | `https://duings.com/` | HTTP GET | 3분 | 200 |
| 4 | BE Liveness | `https://api.duings.com/actuator/health/liveness` | HTTP GET + 키워드 | 3분 | 200 + 본문에 `"UP"` |
| 5 | FE 인증 가드 | `https://duings.com/me` | HTTP GET, **리다이렉트 미추적** | 15분 | **307** |

> ⚠️ **5번은 아직 생성되지 않았다.** 1~4번은 운영 중이고 5번만 문서 선반영이다 —
> Better Stack 콘솔에서 아래 세팅 순서대로 직접 만들어야 실제로 감시가 시작된다.

- **1번**(aggregate)은 프로세스+DB 를, **2번**은 Caddy→앱→DB 실쿼리 경로 전체를, **3번**은 Vercel 서빙을,
  **4번**(liveness)은 DB 를 제외한 프로세스 생존만 본다(감사 13번 — liveness/readiness 분리는 백엔드에 구현·운영 중).
- **5번**은 미들웨어 인증 가드가 살아있는지만 본다. 1~4번은 전부 공개 경로라 보호 경로 장애를 잡지 못한다.
  "미인증 `/me` 는 반드시 307" 이 불변식이라, 200 이면 `/me` 의 가드가 사라진 것이고 500 이면
  `AUTH_HINT_SECRET` 미주입이다. 미들웨어에는 Sentry 계측이 없으므로(Active CPU 절감,
  `frontend/apps/web/instrumentation.ts` 주석 참조) 이 모니터가 유일한 자동 감지 수단이다.
  단 **`/me` 한 경로만 친다** — `/manage`·`/admin`·`/apply` 만 matcher 에서 빠지는 회귀는 못 잡는다.
- **5번 주기를 15분으로 둔 이유**: 보호 경로 요청은 CDN 캐시 이전에 미들웨어를 깨우므로 모니터 자체가
  Active CPU 를 쓴다. 3분 주기면 480건/일로 실사용 미들웨어 호출(2026-08-10 실측 444건/일)을 두 배로
  만들어, 이 모니터를 부른 최적화를 스스로 상쇄한다. 15분이면 96건/일이다. 대신 아래 "2회 연속 실패"
  규칙과 겹쳐 통지까지 **최대 ~30분**이 걸린다 — 배포 사고 감지용으로는 그 정도로 충분하다고 봤다.
- **1차 분류표**: ①1번 Down + 4번 Up → **DB 장애**(Supabase 확인) ②1·4번 동시 Down → 프로세스/VM/Caddy 장애
  ③2번만 Down → 앱 내부(쿼리·직렬화) ④3번만 Down → Vercel ⑤5번만 Down → 프론트 배포(가드·환경변수).
- 기준 응답시간(2026-07-24 실측): health ~1.2s, clubs API ~1.2s, FE ~0.5s.

## 알림 정책

- **다운 판정**: 2회 연속 실패 시 알림(순간 플랩 방지). 복구 시 회복 알림 필수.
- **지연 경보**(지원 시): 응답 5s 초과가 3회 연속이면 저심각 알림.
- **채널**: 이메일(기본) + **Slack(연결 완료, 테스트 수신 확인)**. 모니터 1·2번(백엔드)은 즉시 알림, 3·4·5번도 즉시.
  (Better Stack 무료 티어는 Discord 네이티브·outgoing webhook 미제공 — Slack 연동 사용, 2026-07-24 구성)
- SSL 만료 감시(제공 시 활성): api.duings.com, duings.com — 만료 14일 전 알림.

## 서비스 선택

**추천: Better Stack (Uptime)** — 무료 티어로 모니터 10개·30초~3분 주기·이메일/Slack/Discord 알림·상태 페이지 제공.
대안: UptimeRobot — 무료 50개·5분 주기(주기가 김), 구성 단순.

### Better Stack 세팅 순서 (약 10분)

1. https://betterstack.com 가입 → Uptime → Monitors → Create monitor.
2. 위 표의 모니터를 각각 생성 — "Expected content" 에 키워드(`"UP"` / `"ok":true`) 입력, 주기 3분(1번은 1분 권장), "Confirmation period" 2 체크.
3. **5번은 모니터 타입부터 다르다.** 1~4번이 쓰는 기본 타입(2XX 면 정상 = UI 의 "URL becomes unavailable")
   으로 두면 안 된다. 307 은 2XX 가 아니라 정상인데도 계속 장애로 뜨고, 상태코드 지정도 무시된다
   (Better Stack 문서: 상태코드 배열은 타입이 `expected_status_code` 일 때만 반영).
   - 모니터 타입: **정상으로 볼 상태코드를 직접 지정하는 타입**(API `monitor_type: expected_status_code`)
   - 정상 상태코드: **`307`** (API `expected_status_codes: [307]`)
   - **"Follow redirects" 끄기** (API `follow_redirects: false`) — 켜두면 `/me` 가 307 로 `/login` 에
     보내고 거기서 200 이 나오는데, **가드가 사라져 `/me` 가 그냥 200 을 줘도 똑같이 200 이라** 구분이 안 된다.
   - **"리다이렉트 시 쿠키 유지" 끄기** (API `remember_cookies: false`) — 기본이 켜짐이고, 3xx 를 기대값으로
     두면 Better Stack 이 조합 자체를 거부한다(422 `Cannot keep cookies when redirecting when expecting a
     3xx status code`). 리다이렉트를 안 따라가니 어차피 쓸모없는 옵션이다.
   - 주기 15분(API `check_frequency: 900`)
   - 요약: 정상 = `/me` 가 **자기 자신이 307 을 반환**. 200(가드 소실)·500(시크릿 미주입) 둘 다 장애.

   UI 라벨은 버전에 따라 다르니, 애매하면 API 로 만드는 게 확실하다
   (토큰: Better Stack → Settings → API tokens):

   ```bash
   curl -X POST https://uptime.betterstack.com/api/v2/monitors \
     -H "Authorization: Bearer $BETTERSTACK_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "pronounceable_name": "FE 인증 가드",
       "url": "https://duings.com/me",
       "monitor_type": "expected_status_code",
       "expected_status_codes": [307],
       "follow_redirects": false,
       "remember_cookies": false,
       "check_frequency": 900,
       "email": true
     }'
   ```
4. Integrations → Discord(또는 Slack) 연결 → 알림 정책에 채널 추가(이메일은 기본 on).
5. (선택) Status page 생성 후 모니터 연결 — 팀 공유용.
6. 테스트: 모니터 하나를 Pause→Resume 하거나, "Send test alert" 로 채널 수신 확인.
7. 5번 생성 직후 동작 확인: `curl -s -o /dev/null -w '%{http_code}' https://duings.com/me` → `307`.
   - 307 인데 모니터가 **Down** → 트리거 타입을 안 바꾼 것(기본 2XX 기준이라 307 을 장애로 본다).
   - 307 인데 무슨 짓을 해도 **Up** → follow redirects 가 켜져 있다(`/login` 200 을 보고 있다).

### UptimeRobot 세팅 순서

1. https://uptimerobot.com 가입 → Add New Monitor(HTTP(s)) — Keyword 타입으로 `"UP"`/`"ok":true` 지정.
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
- unhealthy 시 자동 재시작(autoheal 류) — 단일 인스턴스에선 DB 순단 보호를 위해 의도적으로 미도입(compose 주석 참조).
- 5xx 비율 알림(현재는 가용성만) — Sentry alert rule 로 보완 가능.
