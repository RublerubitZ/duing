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
- **앱 운영 이벤트(회원가입·동아리·회비·시설·관리자 조치)와 배포 결과**도 같은 Slack 채널로 온다 — 백엔드 `global/monitoring/` + `deploy-backend.yml` 알림 스텝, 설정·카탈로그·검증 절차는 [`MONITORING.md`](./MONITORING.md).

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
   - 1·2번 동시 다운 → VM/Caddy/네트워크: Lightsail 콘솔에서 인스턴스 상태 확인 → SSH → `cd /home/ubuntu/duing` 뒤 `docker compose ps` / `docker compose logs --tail 100 caddy backend`. 배포 잡이 실패로 끝났거나(실패 종류별 안내는 그 절 첫머리), caddy 가 Up 이 아니거나(배포와 무관해도 — 되돌릴지는 그 절에서 로그로 가른다), HTTP/2 만 문제면 아래 [Caddy 롤백 (증상별)](#caddy-롤백-증상별).
   - 2번만 다운(1번 UP) → 앱/DB 쿼리 경로: backend 로그와 Sentry(backend 프로젝트) 확인, Supabase 대시보드 상태 확인.
   - 서버 부하·연결 수가 치솟거나 여러 IP 의 429 가 쏟아진다 → 공격·트래픽 폭증 의심: [`EDGE-EMERGENCY.md`](./EDGE-EMERGENCY.md) 로 Cloudflare 비상 모드 전환.
   - 3번만 다운 → Vercel 상태(https://www.vercel-status.com) 및 배포 히스토리 확인, 필요 시 Vercel 대시보드에서 직전 배포로 Instant Rollback. 2026-11-04 릴리스 뒤 직전 운영 배포는 10/21 빌드(next 16.3.8)다 — 사이트 전체가 다운됐을 때만 쓰고, 복구한 뒤에는 되돌림 PR 로 다시 앞으로 낸다. 화면 문제는 `deploy/README.md` 의 운영 중단 미결 정리 절처럼 되돌림 PR 로 고친다.
3. **복구 시도(백엔드)**: `docker compose restart backend` → 헬스 재확인. 컨테이너 자체가 기동 불가면 직전 이미지로 롤백 — `deploy/README.md` 의 롤백 절차(서버 `.env` 의 `BACKEND_IMAGE` 를 직전 태그로 되돌리고 `docker compose up -d`) 또는 GitHub Actions Deploy Backend 워크플로의 직전 성공 실행 re-run → 헬스 재확인.
   - 단, **비상 모드(Cloudflare 프록시 ON) 중에는 re-run 으로 롤백하지 않는다** — re-run 은 그 커밋의 Caddyfile 을 다시 올려 서버에 복원한 신뢰 블록을 지울 수 있다. 서버 `.env` 의 `BACKEND_IMAGE` 만 되돌린다([`EDGE-EMERGENCY.md`](./EDGE-EMERGENCY.md) 1-1) → 헬스 재확인.
   - **re-run 은 그 실행 커밋의 `docker-compose.yml`·`Caddyfile` 로 서버를 덮는다(Caddy 버전·프로토콜도 그 커밋으로 돌아간다).** 누르기 전에 실행의 커밋을 세 경우로 가른다(로컬 저장소에서, `git fetch origin` 뒤):

     ```bash
     SHA="$(gh run view <실행 ID> --json headSha -q .headSha)"
     git show "${SHA:?실행 커밋을 못 읽었다}:deploy/Caddyfile" | grep -cxF $'\tservers :443 {'    # 1 → ①
     git show "${SHA:?실행 커밋을 못 읽었다}:deploy/Caddyfile" | grep -cxF $'\t\tprotocols h1'     # 위가 0 일 때: 1 → ②, 0 → ③
     ```

     오류가 나면(`SHA` 가 비었다 — `gh run view` 실패·`<실행 ID>` 를 안 바꿈 — 또는 fetch 전 커밋) grep 은 0 을 찍는다. 그 0 으로 가르지 말고 오류부터 푼다.

     - ① **Caddy 2.11.9 전환 이후 커밋**: 그 커밋의 파일로 서버를 덮는다. 서버가 저장소와 같으면 바뀌는 것이 없지만, 아래 [Caddy 롤백 (증상별)](#caddy-롤백-증상별) 로 서버를 손댄 상태(HTTP/2 만 내림·`.bak` 복원·손으로 내림)면 re-run 하지 않는다 — 그 커밋의 버전·프로토콜(지금은 2.11.9·:443 `h1 h2`)로 되돌아가고 `.bak` 도 덮인다.
     - ② **#1563 ~ 2.11.9 전환 사이 커밋**(2.11.9 전환 릴리스 직후의 '직전 성공 실행'이 여기 든다): re-run 하면 서버가 2.11.4 + `protocols h1` 로 돌아간다. 취약한 조합은 아니지만 Go 보안 수정과 HTTP/2 를 경보 없이 잃고 caddy 가 다시 만들어진다(수 초 끊김). 백엔드만 되돌리려면 위 `BACKEND_IMAGE` 절차를 먼저 쓴다. re-run 했다면 `docker compose exec -T caddy caddy version` 과 바깥에서 `curl -sS -o /dev/null -w '%{http_version}\n' --http2 https://api.duings.com/actuator/health`(`1.1` 이면 HTTP/2 를 잃은 상태)로 다시 확인한다.
     - ③ **#1563 이전 커밋**: re-run 하지 않는다 — 그 커밋의 Caddyfile(`protocols h1 h2`, :80 사이트 없음)이 2.11.4 에서 :443 HTTP/2 와 :80 평문 HTTP/2 를 경보 없이 되살린다(#1397 이전 커밋은 떠다니는 태그다). 서버 `.env` 의 `BACKEND_IMAGE` 만 되돌린다 → 헬스 재확인.
4. **DB 의심 시**: Supabase 대시보드 → Database health. 복구 불가 수준이면 [`DB-RESTORE.md`](./DB-RESTORE.md) 백업/복원 런북(R2 일일 백업, 04:15 KST) 절차로 이관.
5. **사후**: Sentry 이슈 링크와 함께 타임라인 기록(감지→분류→복구), 원인이 배포였다면 해당 커밋 명시.

## Caddy 롤백 (증상별)

배포 워크플로의 자동 롤백은 backend 가 unhealthy 일 때만 돈다 — caddy 가 뜨지 못하는 경우는 덮지 않는다. 잡이 `backend 가 healthy 에 도달하지 못했습니다 — 직전 이미지로 롤백: …` 으로 끝났으면 자동 롤백이 두 `.bak` 을 되돌리고 `docker compose up -d` 를 다시 했으므로 caddy 도 배포 전 파일로 돌아가 있다 — 전환 배포라면 2.11.4 + 옛 Caddyfile 이고, 새 Caddy 가 올라간 것이 아니다(직전 이미지가 없거나 이번 이미지와 같으면 되돌리지 않아 새 파일이 남는다).

Caddy 이미지 태그가 바뀐 배포에서 새 caddy 가 시작된 뒤 죽으면, 배포 잡의 `caddy reload` 가 실패하고(멈춘 컨테이너에는 `docker compose exec` 가 닿지 않는다) 잡은 `Caddyfile.bak` 만 되돌린 뒤 두 번째 reload 도 실패해 `이미지 배포는 성공, Caddy 설정 반영 실패` 로 끝난다. 그때 서버는 **새 compose(2.11.9) + 옛 Caddyfile** 이고, `.bak` 두 개는 배포 전 파일이다. caddy 는 `restart: unless-stopped` 라 그 조합으로 혼자 다시 떠 있을 수도, 계속 죽어 있을 수도 있다(평소의 '실패한 reload 는 돌던 설정을 유지한다'는 컨테이너가 살아 있을 때 이야기다). `docker compose up -d` 자체가 실패하면 잡은 거기서 멈춘다(`set -euo pipefail`) — 그 문구도 `.bak` 복원도 없고, 서버는 새 compose + 새 Caddyfile 이다. 잡이 이렇게 다른 오류로 끝났고 caddy 가 떠 있지 않으면 아래 'caddy 가 뜨지 않는다' 로 간다.

실패한 잡이 파일을 바꿨는지는 잡 로그에 `배포 설정 검증 통과 — compose·Caddyfile 반영 완료` 가 찍혔는지로 가른다(워크플로가 `.bak` 복사와 새 파일 `cp` 를 마친 직후에 찍는 줄이다).

- **그 줄이 없다** — 파일을 바꾸기 전에 멈췄다. 빌드·scp·GHCR 로그인 실패, 또는 `incoming/ 에 docker-compose.yml·Caddyfile 이 없습니다 — 스테이징 실패`·`새 docker-compose.yml 검증 실패 — 기존 설정 유지·배포 중단`·`새 Caddyfile 검증 실패(검증 이미지 pull 실패일 수도 있음) — 기존 설정 유지·배포 중단` 오류다. `.bak` 도 파일도 건드리지 않았으므로 서버는 그대로이고, re-run 이 맞는 대응이다(같은 검증이 또 실패하면 저장소를 고친다).
- **그 줄이 있다** — 새 파일이 서버에 남아 있다(위 헬스 게이트 자동 롤백이 두 `.bak` 을 되돌린 경우만 빼고). `docker compose pull backend`·`up -d`·`Caddy 설정 반영 실패` 어디서 끝났든 re-run 하지 않고 이 절을 따른다.

**새 파일이 서버에 남은 채 끝난 배포 잡을 re-run 하지 않는다.** re-run 은 지금 파일을 먼저 `.bak` 으로 복사하므로 되돌릴 사본(배포 전 파일)이 사라진다 — `Caddy 설정 반영 실패` 뒤라면 `docker-compose.yml.bak` 이 2.11.9 로 덮인다.

아래는 모두 서버 배포 디렉터리(`/home/ubuntu/duing`)에서 하고, 파일은 `cp` 로 덮는다(Caddyfile 은 단일 파일 bind mount — `mv`·편집기 저장 금지).

- **배포 잡이 `Caddy 설정 반영 실패` 로 끝났다** — 먼저 지금 상태를 본다.

  ```bash
  cd /home/ubuntu/duing
  docker compose ps caddy                                   # Up 인가(Restarting·Exited 면 죽어 있다)
  docker compose exec -T caddy caddy version                # 떠 있으면 버전
  docker compose exec -T caddy curl -s localhost:2019/config/apps/http/servers | grep -o '"protocols":\[[^]]*\]'
  grep -E '^ *image: caddy' docker-compose.yml docker-compose.yml.bak
  grep -cxF $'\tservers :443 {' Caddyfile Caddyfile.bak     # 0 = 옛 형태(전역 servers · protocols h1)
  ```

  - caddy 가 Up 이고 `v2.11.9`, 되읽기가 `"protocols":["h1"]` 두 줄이면 2.11.9 + 옛 Caddyfile(HTTP/1.1 전용)로 돌고 있다. 안전한 조합이고 API 는 산다. 급히 바꾸지 않는다 — `docker compose logs --tail 100 caddy` 로 새 Caddyfile 이 왜 뜨지 못했는지 보고, 저장소에서 고치거나 2.11.9 전환 PR 을 되돌리는 PR 로 맞춘다.
  - caddy 가 Up 이 아니면 아래 'caddy 가 뜨지 않는다' 로 간다.
  - Up 인데 되읽기에 `["h1","h2"]` 가 있으면 컨테이너는 새 설정으로 떠 있고 파일만 옛 것이다. `docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile` 로 파일(옛 설정)과 맞춘 뒤 첫 경우로 본다.
- **caddy 가 뜨지 않는다(API 전체 불통)** — `docker compose ps caddy` 가 Up 이 아니거나 `docker compose logs --tail 50 caddy` 에 기동 오류가 있다.
  되돌리기 전에 원인을 가른다 — **로그나 `up -d` 출력(배포 잡 로그, 또는 손으로 다시 친 `docker compose up -d caddy` 의 출력)이 설정·버전 탓인 기동 오류를 가리킬 때만 되돌린다.** 배포와 무관하게 내려갔으면(OOM 등 — 설정 오류가 없다) 되돌리지 않고 `docker compose up -d caddy` 로 다시 띄운 뒤 로그를 본다 — 다시 띄워도 로그나 `up -d` 출력이 설정·버전을 가리키며 뜨지 않으면 아래 복원으로 이어 간다. 설정·버전 탓인데 아래 `diff` 두 개가 아무것도 찍지 않으면 `.bak` 이 지금 파일과 같아 되돌릴 사본이 없다(실패한 전환 잡을 re-run 해 `.bak` 이 지금 파일과 같아진 경우 등) — 아래 '손으로 내릴 때' 로 간다.

  ```bash
  cd /home/ubuntu/duing
  docker compose logs --tail 50 caddy                                     # 설정·버전 탓인 기동 오류인가
  diff docker-compose.yml.bak docker-compose.yml; diff Caddyfile.bak Caddyfile    # 아무것도 안 찍히면 되돌릴 사본이 없다
  ```

  설정·버전 탓이면 배포 워크플로가 파일을 바꾸기 직전에 만든 `docker-compose.yml.bak`·`Caddyfile.bak` 을 **둘 다** 되돌린다 — 하나만 되돌리면 버전과 Caddyfile 이 어긋날 수 있다(예: 옛 버전 + 새 Caddyfile(:443 HTTP/2)).
  `.bak` 은 배포마다 그 직전 파일로 덮이므로, 무엇이 들어 있어야 맞는지는 때에 따라 다르다. 짝은 compose 의 caddy 태그와 Caddyfile 형태로 본다 — `2.11.4-alpine` 이면 옛 형태(`servers :443 {` 0줄), `2.11.9-alpine` 이면 새 형태(1줄). 같은 배포에서 나왔으면 두 파일의 시각도 몇 초 안이다.
  - **2.11.9 전환 배포가 만든 `.bak` 이 남아 있는 동안**(전환 배포 뒤로 Deploy Backend 가 다시 돈 적이 없다 — 그 잡의 re-run 도 '다시 돈 것'이다): 두 `.bak` 은 2.11.4·옛 형태여야 한다. 짝을 보고 둘 다 되돌린다.
  - **그 뒤(전환 배포 다음 배포부터)**: 두 `.bak` 은 직전 정상본이다(보통 2.11.9·새 형태). 버전으로 판정하지 않는다 — 둘이 짝이 맞는지만 보고 둘 다 되돌린다. 짝이 깨졌으면(2.11.9·옛 형태 — 대개 실패한 전환 잡을 re-run 한 흔적이다) 되돌릴 사본이 없으니 되돌리지 않고 아래 '손으로 내릴 때' 로 간다.

  ```bash
  cd /home/ubuntu/duing
  ls -l --time-style=full-iso docker-compose.yml.bak Caddyfile.bak    # 두 시각이 몇 초 안이어야 한다(같은 배포)
  grep -E '^ *image: caddy' docker-compose.yml.bak                     # 전환 배포의 .bak 이면 2.11.4-alpine
  grep -cxF $'\tservers :443 {' Caddyfile.bak                          # 짝: 2.11.4-alpine ↔ 0(옛 형태), 2.11.9-alpine ↔ 1(새 형태)
  cp docker-compose.yml.bak docker-compose.yml
  cp Caddyfile.bak Caddyfile
  docker compose up -d caddy
  docker compose exec -T caddy caddy version                           # .bak 의 버전(전환 배포의 .bak 이면 v2.11.4)
  curl -sS -o /dev/null -w '%{http_code} %{http_version}\n' https://api.duings.com/actuator/health    # 200 과 1.1(옛 형태) 또는 2(새 형태)
  ```

  그 뒤 저장소를 서버와 맞춘다 — 전환 배포의 `.bak` 을 되돌렸으면 2.11.9 전환 PR 을 되돌리는 PR 로(되돌리면 CI 검사도 HTTP/1.1 전용으로 함께 돌아간다), 그 뒤 배포의 `.bak` 을 되돌렸으면 마지막 배포가 바꾼 compose·Caddyfile 을 되돌리는 PR 로 맞춘다. 맞추기 전에 Deploy Backend 가 돌면 저장소 파일로 다시 덮인다.
  짝 맞는 2.11.9 `.bak` 으로 되돌려도 뜨지 않고 `docker compose logs --tail 50 caddy` 가 Caddy 2.11.9 자체의 문제(panic 등)를 가리키면 아래 '손으로 내릴 때' 로 간다.
- **HTTP/2 만 문제다**(HTTP/2 로 붙는 요청만 실패하거나 caddy 로그에 panic) — 버전은 두고 :443 을 `protocols h1` 로 내린다(2026-10-24 #1563 과 같은 방식).

  ```bash
  cd /home/ubuntu/duing
  cp Caddyfile Caddyfile.before-h1
  sed $'s/^\t\tprotocols h1 h2$/\t\tprotocols h1/' Caddyfile > /tmp/Caddyfile.h1
  docker compose exec -T caddy caddy validate --config - --adapter caddyfile < /tmp/Caddyfile.h1
  grep -cE '^[[:space:]]*protocols[[:space:]].*h2' /tmp/Caddyfile.h1    # 0 이어야 한다
  ```

  validate 가 통과했고 마지막 줄(검사)이 0 일 때만 아래를 실행한다. 검사가 0 이 아니면 서버의 protocols 줄이 저장소 글자와 달라(끝 공백·공백 들여쓰기·줄 끝 주석·`h2 h1` 순서 등) sed 가 바꾸지 못한 것이다 — 거기서 멈추고, `/tmp/Caddyfile.h1` 에서 그 줄(`-c` 를 `-n` 으로 바꾸면 보인다)을 손으로 `protocols h1` 로 고친 뒤 위 블록의 마지막 두 줄(validate·검사)만 다시 돌린다(sed 줄을 다시 돌리면 고친 사본이 덮인다).

  ```bash
  cd /home/ubuntu/duing
  cp /tmp/Caddyfile.h1 Caddyfile
  docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  docker compose exec -T caddy curl -s localhost:2019/config/apps/http/servers | grep -o '"protocols":\[[^]]*\]'    # 둘 다 ["h1"]
  ```

  바깥에서 `curl -sS -o /dev/null -w '%{http_version}\n' --http2 https://api.duings.com/actuator/health` → `1.1`. 저장소는 :443 을 `protocols h1` 로 바꾸는 후속 PR 로 맞추는데, **같은 PR 에서 `.github/workflows/deploy-config-ci.yml` 의 :443 프로토콜 검사(① — 지금 기대값 `["h1","h2"]`)도 `["h1"]` 로** 바꿔야 Gate 를 통과한다(버전 하한 검사 ④ 는 :443 에 h2 가 없으면 저절로 건너뛴다). 그 PR 이 들어가기 전에 Deploy Backend 가 돌면 서버가 저장소의 `h1 h2` 로 돌아간다.
- **손으로 내릴 때**(2.11.9 자체가 원인일 때만 — 위 'caddy 가 뜨지 않는다' 에서 되돌릴 사본이 없거나(`diff` 가 비었다·`.bak` 짝이 깨졌다), 짝 맞는 2.11.9 `.bak` 으로 되돌려도 2.11.9 가 뜨지 않을 때) — 태그만 2.11.4 로 내리지 않는다. 2.11.8 미만 빌드는 Go HTTP/2 서버 DoS 수정이 없으니 :443 을 `protocols h1` 로 함께 바꾼다. 주소별 `servers` 문법은 2.11.4 도 받는다(2026-11-18 확인).

  ```bash
  cd /home/ubuntu/duing
  cp docker-compose.yml docker-compose.yml.before-down
  cp Caddyfile Caddyfile.before-down
  sed $'s/^\t\tprotocols h1 h2$/\t\tprotocols h1/' Caddyfile > /tmp/Caddyfile.down      # 옛 형태 파일이면 바뀌는 것이 없다
  sed 's/2\.11\.9-alpine/2.11.4-alpine/' docker-compose.yml > /tmp/docker-compose.yml.down
  grep -E '^ *image: caddy' /tmp/docker-compose.yml.down                               # 2.11.4-alpine 이어야 한다
  docker run --rm -i "$(grep -E '^ *image: caddy' /tmp/docker-compose.yml.down | awk '{print $2}')" caddy validate --config - --adapter caddyfile < /tmp/Caddyfile.down
  grep -cE '^[[:space:]]*protocols[[:space:]].*h2' /tmp/Caddyfile.down                  # 0 이어야 한다
  ```

  `image:` 줄이 `2.11.4-alpine` 이고 validate 가 통과했고 마지막 줄(검사)이 0 일 때만 아래를 실행한다. 검사가 0 이 아니면 위 'HTTP/2 만 문제다' 의 안내대로 `/tmp/Caddyfile.down` 에서 그 줄을 손으로 `protocols h1` 로 고치고, 위 블록의 마지막 두 줄(validate·검사)만 다시 돌린다.

  ```bash
  cd /home/ubuntu/duing
  cp /tmp/Caddyfile.down Caddyfile
  cp /tmp/docker-compose.yml.down docker-compose.yml
  docker compose up -d caddy
  docker compose exec -T caddy caddy version                                             # v2.11.4
  docker compose exec -T caddy curl -s localhost:2019/config/apps/http/servers | grep -o '"protocols":\[[^]]*\]'    # 두 줄 모두 ["h1"] — 한 줄뿐이면 :443 에 protocols 줄이 없다(2.11.4 기본값은 h1 h2 h3 라 HTTP/2 가 켜진다)
  ```

  이미 한 번 적용한 뒤 Caddyfile 만 다시 고쳐 적용할 때는(예: 되읽기가 한 줄뿐이다) 앞 블록을 처음부터 다시 돌리지 않는다 — 사본 만들기 줄이 `.before-down` 을 이미 내린 파일로 덮는다. `/tmp/Caddyfile.down` 의 `servers :443 {` 블록 안에 `protocols h1` 줄을 넣고(들여쓰기는 같은 블록의 다른 줄과 같게), 앞 블록의 마지막 두 줄(validate·검사)로 확인한 뒤 `cp /tmp/Caddyfile.down Caddyfile` 한다. 태그가 같아 `docker compose up -d caddy` 가 컨테이너를 다시 만들지 않으니 `docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile` 로 반영하고, 위 블록의 되읽기 줄로 두 줄 모두 `["h1"]` 인지 다시 본다.

  저장소는 2.11.9 전환 PR 을 되돌리는 PR 로 맞춘다. 그 PR 이 들어가기 전에 Deploy Backend 가 돌면(main push·re-run·수동 실행) 서버가 저장소의 2.11.9·:443 `h1 h2` 로 다시 덮인다.
- **일반 경로**: 2.11.9 전환 PR 을 통째로 되돌리는 PR 을 develop 에 머지하고 main 으로 내보낸다(배포가 두 파일을 함께 되돌리고, CI 검사도 함께 돌아간다).

## 미커버 (후속)

- 서버 내부 지표(Hikari pool·CPU/RSS·p95)와 request ID 추적 — 감사 12번 본대응.
- unhealthy 시 자동 재시작(autoheal 류) — 단일 인스턴스에선 DB 순단 보호를 위해 의도적으로 미도입(compose 주석 참조).
- 5xx 비율 알림(현재는 가용성만) — Sentry alert rule 로 보완 가능.
