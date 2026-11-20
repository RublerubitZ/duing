# Slack 운영 모니터링 (#duing-monitoring)

> 설계: `docs/superpowers/specs/2026-08-23-slack-ops-monitoring-design.md`. 가용성 모니터·장애 런북은 `UPTIME.md`.

## 역할 분리 — 어디서 무엇을 보나

| 시스템 | 역할 | Slack 으로 오는 것 |
|---|---|---|
| **Sentry** | 예외·스택·릴리스 회귀·장애 분석 | **없음** — Slack 연동은 유료 플랜 기능이라 진행하지 않음(2026-08-23 결정). High 이슈는 기존 이메일 알림(규칙 3609658) 유지 |
| **PostHog** | 사용자 행동·pageview (FE 전용) | 없음 |
| **Better Stack** | 가용성(BE health·API·FE·liveness·인증 가드) | 다운/복구 알림(연결 완료) |
| **Slack 채널 자체** | 운영 이벤트·주요 비즈니스 이벤트·배포 결과 | 아래 이벤트 카탈로그 + 배포 |

보내지 않는 것: 일반 API 요청·일반 로그인·pageview·debug 로그·일반 CRUD·모든 4xx·스케줄러 실행 로그·쿼리 로그·5xx 건별 알림.
**Slack 은 로그 집계기가 아니다.** 새 이벤트를 추가할 땐 "운영자가 즉시 알아야 하는가" 를 먼저 묻는다.
스케줄 잡 5개(자동 마감 00:40·미처리 리마인더 09:30·시설 수집 10분·학교 반영 확인 10분·문의 파기 04:40)의 마지막 실행은 총동연 홈 '자동 작업' 카드(`scheduled_job_run`)에서 보인다. Slack 으로는 즉시 알림 없이 매일 09:00 일간 요약(`TRAFFIC_DAILY_SUMMARY`)에 상태 줄로 실린다 — 늦음·실패·일부 실패인 작업만 이름이 붙는다. DB 백업(`backup.yml`)의 마지막 성공도 같은 요약에 실린다([런북](#런북--일간-요약의-자동-작업백업-경고)). 00:01 처리 대기 기록은 카드 대상이 아니라 `admin_pending_snapshot` 행으로 확인한다.

## 채널

`#duing-monitoring` 하나로 시작한다(세분화는 소음이 문제가 될 때). Better Stack·배포·앱 이벤트 모두 같은 채널(Sentry 는 이메일).
Better Stack 이 이미 보내는 운영 채널이 따로 있으면 새 채널을 만들지 말고 **그 채널의 webhook** 을 쓴다(이 문서의 채널명은 가정).

## 앱 이벤트 카탈로그 (백엔드 `global/monitoring/`)

| 이벤트 | 발생 시점 | 메시지 필드(전부 명시 필드 — 그 외는 구조적으로 없음) |
|---|---|---|
| `USER_REGISTERED` | 회원가입 커밋 | 이름·학번·UserId·환경·가입시간(KST)·**Octomo 호출(자체 집계, 오늘) n / 상한** |
| `CLUB_CREATED` | 동아리 생성 | 동아리명·ClubId·회장 UserId |
| `CLUB_STATUS_CHANGED` | 총동연 승인/거절/운영중단/재개 | 동아리명·ClubId·상태 전이·관리자 UserId (거절 사유 제외) |
| `CLUB_CLOSED` | 총동연 폐쇄 | 동아리명·ClubId·관리자 UserId (사유 제외) |
| `FEE_ACCOUNT_CREATED` | 회비 계좌 **최초** 등록 | ClubId·계좌Id·은행 코드·등록자 UserId (계좌번호·예금주 제외) |
| `ADMIN_USER_ACTION` | 계정 정지/해제/강제 로그아웃 | 조치·대상 UserId·관리자 UserId (사유 제외) |
| `RECRUITMENT_OPENED` | 모집 생성·교체 시점에 **이미 OPEN 이고 시작일이 지난 경우만**(예정→날짜 도래 오픈·수정 경유는 이벤트 자체가 없음) | 동아리명·ClubId·모집 제목(공개 게시물 — 자유 텍스트 예외)·RecruitmentId·마감 |
| `FACILITY_BOOKING_SUBMITTED` / `_REJECTED` / `_CANCELLED`(관리자) / `_CONFLICT` | 시설 예약 | BookingId·ClubId (거절·취소 사유·충돌 상세 제외) |
| `FRONTEND_REVALIDATION_FAILING` / `_RECOVERED` | 정각 `/clubs` 재생성 트리거가 **3회 연속 실패한 순간 한 번**(이어지는 실패는 조용) / 그 뒤 첫 성공 한 번 | 경로·연속 실패 횟수·마지막 사유(상태 코드·예외 클래스명 — 비밀값·URL·응답 본문 제외)·런북 줄. 조치는 아래 [런북](#런북--프론트-재생성-트리거-연속-실패) |
| `TRAFFIC_SURGE_DETECTED` / `_RECOVERED` | api 분당 요청(기준 3,000)이나 분당 429(기준 300)가 기준 이상인 1분 집계가 **2회 이어진 순간 한 번**(이어지는 이상은 조용) / 그 뒤 **5회 연속 기준 미만**일 때 한 번 | 이상 구간 최대 분당 요청·429 와 기준·판정 줄·확인 안내·런북 줄 / 이상 구간 최대치·판정 줄. 집계 수치만 — IP·경로 없음. 조치는 아래 [런북](#런북--api-트래픽-이상) |
| `TRAFFIC_DAILY_SUMMARY` | 매일 09:00 KST 를 넘는 첫 1분 집계에서 한 번 — 전날 09:00 ~ 당일 09:00 | 기간(재기동 뒤부터면 표시)·총 요청(429)·최대 분당 요청(시각)·최대 분당 429·한 IP 분당 최대 조회(한도와 나란히 — 읽는 법은 [런북](#런북--api-트래픽-이상) 4)·이상 감지 횟수·기준. 기준 줄 뒤에 **자동 작업 개수 줄**(정상·첫 실행 전·꺼짐·경고)과 늦음·실패·일부 실패인 작업마다 `⚠️ {작업 키} {상태} — 마지막 종료 …`, 그리고 **마지막 백업 성공**(26시간을 넘거나 기록이 없으면 ⚠️)이 붙는다. ⚠️ 줄이 하나라도 있으면 머리말이 `⚠️ api 트래픽 일간 요약 — 자동 작업·백업 확인 필요` 로 바뀌고 끝에 런북 줄이 붙는다([런북](#런북--일간-요약의-자동-작업백업-경고)). 집계 수치·작업 키·시각만(IP 없음). "즉시 알아야 하는 것" 원칙의 예외다 — **감지 잡이 살아 있다는 신호**이자 기준 조정 근거라 하루 한 번만 보낸다 |

시간 줄: `USER_REGISTERED` 만 가입 트랜잭션 시각(가입시간), 나머지는 리스너 수신 시각(발행과 ms 차이), `FRONTEND_REVALIDATION_*`·`TRAFFIC_SURGE_*`·`TRAFFIC_DAILY_SUMMARY` 은 판정(발송) 시각.

의도적으로 싣는 개인정보: **이름·학번·UserId**(회원가입). 절대 싣지 않는 것: 이메일(수집 안 함)·전화번호·비밀번호·JWT/refresh/cookie/Authorization·요청 바디·계좌번호·예금주·자유 텍스트 사유·접속 IP.

### Octomo 줄에 대하여
Octomo(octoverse.kr) 는 **잔여 쿼터 조회 API 를 제공하지 않는다**(공개 엔드포인트는 `message/exists`·`qr-code` 둘뿐, 한도 초과는 429 로만 드러남).
메시지의 `Octomo 호출(자체 집계, 오늘): n / 1,000` 은 앱 인메모리 카운터(`MoPollThrottle`, KST 자정 리셋, 재기동 시 0, 단일 인스턴스)의
**우리 쪽 측정값**이다. 벤더 월 쿼터(Free 10,000/월)·잔여량은 Octomo 마이페이지 > 사용량에서만 확인한다.

### 동작 방식·장애 격리
- 발행은 서비스 트랜잭션 안, 수신은 `@TransactionalEventListener(AFTER_COMMIT)` + `@Async("monitoringTaskExecutor")`.
  → 롤백(중복 가입 409 등)이면 아무것도 가지 않고, Slack 지연·실패는 HTTP 응답에 영향이 없다.
- `SlackNotifier`: connect 3s / read 5s. **5xx·429 에만 1회 재시도**(서버 거절 = 미반영 확정), 타임아웃·네트워크 오류는 재시도 안 함(중복 게시 방지).
  최종 실패는 ERROR 로그(스택·URL·응답 바디 없음) → Sentry 이슈 `Slack 운영 알림 전송 실패`.
- 큐(100) 포화 시 알림 폐기 + warn. 알림은 손실 허용, 서비스는 비손실.
- 예외: `FRONTEND_REVALIDATION_*` 은 이벤트 없이 정각 잡 스레드(`FrontendRevalidator`)가 직접 보낸다 — 스케줄러 스레드엔
  트랜잭션이 없어 AFTER_COMMIT 리스너로는 버려진다. 전송 지연은 정각 잡에만 걸리고, 전송 실패는 재전송하지 않는다.
- `TRAFFIC_SURGE_*`·`TRAFFIC_DAILY_SUMMARY` 도 같다 — 1분 간격 잡(`TrafficSurgeMonitor`)이 직접 보낸다. 상태·카운터는 메모리라 재기동하면 처음부터 센다.

## 설정

| 위치 | 키 | 값 |
|---|---|---|
| 서버 `deploy/.env` | `SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL. 미설정/빈 값이면 **비활성으로 부팅**하고 시작 로그에 `[Slack 운영 알림] 비활성` WARN 한 줄(부팅 실패 아님 — 모니터링이 배포를 깨지 않게) |
| GitHub Secrets | `SLACK_WEBHOOK_URL` | 배포 결과 알림용(선택 — 없으면 스텝 생략) |
| 로컬 `backend/.env` | `SLACK_WEBHOOK_URL` | 비워 둔다. 운영 webhook 을 로컬에서 쓰지 말 것 |
| 서버 `deploy/.env`(선택) | `DUING_TRAFFIC_SURGE_ENABLED` | 트래픽 이상 감지. 운영 기본 `true` — 끌 때만 `false`. 켜져 있으면 시작 로그에 `[트래픽 이상 감지] 활성 — 기준 …` 한 줄. 끄면 09:00 일간 요약도 없어져 그 안의 자동 작업·백업 감시도 함께 멈춘다 |
| 서버 `deploy/.env`(선택) | `DUING_TRAFFIC_SURGE_REQUESTS_PER_MINUTE` | 분당 요청 기준. 기본 3000. 정수만 — 숫자가 아니면 부팅이 실패한다 |
| 서버 `deploy/.env`(선택) | `DUING_TRAFFIC_SURGE_REJECTIONS_PER_MINUTE` | 분당 429 기준. 기본 300. 정수만 — 숫자가 아니면 부팅이 실패한다 |
| 서버 `deploy/.env`(선택) | `DUING_RATE_LIMIT_API_READ_PER_MINUTE` | 조회 요청 제한 — 한 IP 가 분당 부를 수 있는 GET·HEAD 건수. 기본 1000, 0 이하면 끈다. 정수만 넣는 것이 원칙이다 — **2026-11-18 릴리스(main `ef4b79296`) 이미지까지는 빈 값·정수가 아닌 값(`1,000`·`abc` 등)에서 기동이 실패하고 재시작을 되풀이한다.** 그 뒤 릴리스부터는 코드 기본값 1000 으로 기동하고 ERROR `[조회 요청 제한] 한도 설정값을 정수로 읽지 못해 …` 가 남는다(관대한 처리는 안전망이다). int 범위(약 21억)를 넘는 값도 읽지 못한 값으로 본다. **어느 이미지든 빈 값으로는 끌 수 없다 — 끌 때는 `0`**. 가두모집처럼 한 Wi-Fi 에 수십 명이 몰릴 날은 미리 올린다. 바꾼 뒤 `docker compose up -d`(`restart` 는 `.env` 를 다시 읽지 않는다) — 컨테이너를 다시 만들어 1~2분 끊기고 배포의 헬스 게이트·자동 롤백을 거치지 않으니, 끝나면 `docker compose ps` 로 healthy 를 보고 `docker compose logs backend \| grep '조회 요청 제한'` 의 시작 줄(`[조회 요청 제한] 활성 — 한 IP 분당 …건` / `비활성 — …`)로 적용된 한도를 확인한다. 시작 줄은 그 뒤 릴리스부터 남는다 — 줄이 없으면 2026-11-18 릴리스까지의 이미지이고, 그 이미지에서는 healthy 가 곧 값을 정수로 읽었다는 뜻이다. 다만 시작 줄은 준비 완료 뒤에 찍혀 healthy 직후에는 아직 없을 수 있으니 잠시 뒤 다시 보고, 이미지가 무엇인지는 줄 유무가 아니라 `.env` 의 `BACKEND_IMAGE` 태그로 확인한다. 그 뒤 릴리스에서는 잘못된 값도 healthy 로 뜨니 healthy 만으로는 알 수 없다. 잘못된 값을 둔 채 2026-11-18 릴리스까지의 이미지로 되돌리면(그 뒤 첫 릴리스의 자동 롤백 포함) 기동 실패·재시작 반복이 되니, 롤백 전에 값을 정수로 고친다. 한 IP 에서 나가는 부하 테스트는 0 으로 두고 돌린다 |

Webhook 발급: Slack → 앱 디렉터리 "Incoming Webhooks" → 채널 `#duing-monitoring` 선택 → URL 복사.
**릴리스 순서**: ① 서버 `.env` 에 `SLACK_WEBHOOK_URL=...` 추가 → ② GitHub Secret 추가 → ③ develop→main 릴리스. ①을 빼먹어도 배포는 성공하지만 앱 알림이 조용히 꺼진다 — 릴리스 후 컨테이너 시작 로그에서 `[Slack 운영 알림] 활성` 을 확인한다.

## P0 — Sentry 알림은 이메일로 유지 (Slack 연동 미진행)

Sentry 의 Slack 연동은 유료 플랜 기능이라 **진행하지 않기로 했다(2026-08-23)**. High/Critical 이슈·5xx 급증은
기존 Sentry 이메일 알림(프로젝트 `java-spring-boot` 규칙 "Send a notification for high priority issues", id 3609658)으로
받는다. 플랜이 바뀌어 연동하게 되면: Sentry → Settings → Integrations → Slack 설치 → 위 규칙의 Actions 에
"Send a Slack notification to #duing-monitoring" 추가(이메일 액션 유지) — 그 외 코드 변경은 필요 없다.

Sentry 에 스택트레이스를 Slack 으로 그대로 복제하는 별도 코드는 두지 않는다 — 5xx 건별 Slack 알림은 Sentry 와 중복·폭주 위험이다.

## 검증 — 실채널 없이 end-to-end

```bash
# 1) mock webhook — 받은 페이로드를 그대로 찍는다 (MODE=500 이면 5xx 로 응답해 재시도를 본다)
python3 - <<'EOF' &
# 앱은 고정 길이 바디(Content-Length)로 보낸다 — 이 최소 mock 은 chunked 를 처리하지 않는다.
import json, os
from http.server import BaseHTTPRequestHandler, HTTPServer
MODE = os.environ.get("MODE", "200")
class H(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        print("=== webhook hit ===", flush=True); print(json.loads(body)["text"], flush=True)
        self.send_response(int(MODE)); self.end_headers(); self.wfile.write(b"ok")
    def log_message(self, *a): pass
HTTPServer(("127.0.0.1", 8099), H).serve_forever()
EOF
# 2) 백엔드 기동 시 SLACK_WEBHOOK_URL=http://127.0.0.1:8099/hook 을 주입하고 가입 API 를 한 번 호출한다.
# 3) 터미널에 "🟢 신규 회원 가입 … Octomo 호출(자체 집계, 오늘): n / 1,000" 이 찍히고, 가입 응답은 201 이어야 한다.
#    MODE=500 으로 다시 돌리면 webhook hit 이 정확히 2번 찍히고(1회 재시도) 가입은 여전히 201, 백엔드 로그에 ERROR 1줄.
```

실채널 확인은 위 2) 의 URL 만 진짜 webhook 으로 바꿔 같은 절차로 한다(로컬 서버·테스트 학번 — 운영 DB 에 가입 데이터를 만들지 않는다).

## 런북 — Slack 알림이 안 올 때

1. 서비스 영향은 없다(격리 설계). 급하지 않다.
2. Sentry 에 `Slack 운영 알림 전송 실패 — reason=HTTP_4xx/5xx/…` 이슈가 있으면: 4xx(특히 404/410) = webhook 폐기됨 → 재발급 후 `.env` 교체·재기동. 5xx/타임아웃 = Slack 측 장애, 자연 복구.
3. 이슈가 없고 조용하면: 컨테이너 시작 로그에 `[Slack 운영 알림] 비활성` WARN 이 있는지(= 서버 `.env` 의 `SLACK_WEBHOOK_URL` 미설정) 확인.

## 런북 — 프론트 재생성 트리거 연속 실패

`FRONTEND_REVALIDATION_FAILING` 이 오면 본다. 매시 정각 `ClubMetricRefreshJob` 이 프론트에 `/clubs` 재생성을 요청한다
(`POST /api/internal/revalidate` → 2xx 면 1초 뒤 warm-up GET). 재검증 2xx 와 warm-up 2xx 가 둘 다여야 성공이고,
연속 실패가 3회(정각 기준 3시간)에 닿으면 한 번 알린다. 재집계 실패로 요청을 건너뛴 시간은 세지도 0 으로 되돌리지도 않는다.

1. **영향**: 서비스 장애는 아니다. 그동안 `/clubs` 는 자체 1시간 주기로만 다시 만들어져, 정각에 바뀐 추천순이 늦게 보인다.
   단, 사유가 `warm-up …` 이면 지운 뒤 다시 그리지 못한 것이라 그 시각 `/clubs` 요청이 오류 화면을 받았을 수 있다 — 먼저 본다.
2. **사유 → 조치** — 메시지의 `마지막 사유` 는 백엔드 WARN(`프론트 재생성 요청 실패`/`warm-up 실패 — reason=…`)의 `reason` 과 같고,
   warm-up 실패만 앞에 `warm-up` 이 붙는다(WARN `reason=HTTP_500` → 사유 `warm-up HTTP_500`).

| 마지막 사유 | 뜻 | 조치 |
|---|---|---|
| `HTTP_401` | 비밀값 짝 불일치 | 서버 `.env` `DUING_FRONTEND_REVALIDATE_SECRET` 과 Vercel `REVALIDATE_SECRET` 을 같은 값으로 맞춘다(한쪽만 바꾼 경우). 서버는 재기동, Vercel 은 재배포해야 반영된다 |
| `HTTP_503` | Vercel `REVALIDATE_SECRET` 미설정·32바이트 미만 | Vercel 환경변수를 넣고 재배포. 사이트 전체가 503 이고 Better Stack 프론트 다운 알림이 함께 왔다면 프로젝트 일시정지(Hobby 사용량 초과)일 수 있다 — Vercel Usage 를 먼저 본다 |
| `HTTP_403` | 방화벽 차단 | Vercel Firewall 사용자 규칙 `내부 재검증 — 백엔드 서버 외 차단 (#1364)` 의 IP 조건이 지금 서버 고정 IP 와 같은지 확인(고정 IP 를 바꿨다면 EDGE-EMERGENCY.md 1-6). 그 밖의 앞단 규칙이 백엔드 요청(UA `DuingBackend-Revalidator/1.0`)을 막는지도 본다 |
| `HTTP_400` | 허용 목록 밖 경로 | 프론트 `app/api/internal/revalidate/route.ts` 의 허용 목록과 백엔드가 보낸 경로를 대조 |
| `HTTP_3xx` | `DUING_FRONTEND_BASE_URL` 리다이렉트(apex↔www) | 서버 `.env` 를 리다이렉트 없는 최종 주소로 고치고 재기동 |
| `HTTP_502` | 프론트 사전 확인 실패 — 지우기 전에 기본 목록을 못 받아 재검증을 건너뜀 | Vercel 로그 `[revalidate] /clubs 사전 확인 실패` 의 `reason`(timeout·network·http-5xx·empty 등)으로 백엔드 목록 API 상태 확인. 그 로그가 없으면 Vercel 플랫폼 오류(함수 무응답 등)다 |
| `warm-up HTTP_5xx`·`warm-up <예외>` | `/clubs` 재생성(렌더) 오류 | Vercel 함수 로그에서 `/clubs` 렌더 오류 확인 |
| 예외 클래스명(`ResourceAccessException` 등) | 연결 실패·타임아웃 | 프론트 가용성(Better Stack)·DNS·서버 아웃바운드 확인 |
| 그 밖의 `HTTP_4xx`·`HTTP_5xx`(404·429·500·504 등) | 라우트 미배포·경로 오류·라우트 예외·함수 타임아웃 | Vercel 함수 로그에서 `/api/internal/revalidate` 요청 확인 |

3. 고친 뒤에는 기다린다 — 재시도는 없고 다음 정각에 다시 시도한다. 성공하면 `FRONTEND_REVALIDATION_RECOVERED` 가 한 번 온다.
4. **복구 알림이 안 올 때**: 카운터는 메모리라 알림 뒤 재기동(배포)하면 복구 알림이 오지 않는다. 다음 정각 백엔드 INFO
   `프론트 재생성 warm-up 응답 — path=/clubs, status=HTTP_200` 으로 확인한다.
5. Slack 이 비활성이거나 전송이 실패해도(재전송 없음) 백엔드 로그에 WARN `프론트 재생성 연속 실패 — path=…, streak=3, reason=…` 이 한 줄 남는다.

### 동아리 상세 재생성 — 알림 없이 WARN 만

동아리 상세(`/clubs/<id>`)가 바뀌는 커밋(정보 수정·중앙 전환·사진 등록/캡션 수정/순서/삭제·대표 활동 추가/수정/순서/삭제·회장 변경·상태 전이·폐쇄·모집 게시/수정/접수 중단/마감/삭제·총동연 강제 마감·기간 종료 모집 자동 마감(매일 00:40)·회장 본인 이름 변경) 뒤 백엔드가
전용 실행기(단일 스레드·큐 100)에서 같은 재검증·warm-up 을 한 경로씩 요청한다(#1356).

- **상세 재생성 실패는 알림 없이 WARN 만 남는다** — 위 연속 실패 집계·`FRONTEND_REVALIDATION_*` 에 넣지 않는다(동아리마다
  드물게 불려 "연속" 의 의미가 없고, 비밀값·설정 오류는 정각 `/clubs` 신호가 잡는다). WARN 은
  `프론트 재생성 요청 실패 — path=/clubs/<id>, reason=…`·`프론트 재생성 warm-up 실패 — path=/clubs/<id>, reason=…` 이고
  사유 → 조치는 위 표와 같되, 상세에서 `HTTP_502` 는 `[revalidate] /clubs/<id> 사전 확인 실패`(상세 API 조회 실패 —
  `reason` 은 timeout·network·http-NNN·unavailable 등, 빈 목록 `empty` 는 없다)이고 warm-up 실패는 그 상세 렌더 오류다.
  **warm-up 실패를 먼저 본다** — 요청 실패는 지우지 않아 직전본이 남지만, warm-up 실패는 이미 지운 뒤라 렌더 오류가
  이어지는 동안 그 상세 방문자가 오류 화면을 받을 수 있다. 재시도는 없다 — 그 상세는 같은 동아리의 다음 변경, 매일 00:05
  재생성(진행 중이거나 최근 이틀 안에 마감한 모집이 있을 때), 프론트 자체 재생성 주기 중 먼저 오는 것으로 갱신된다.
  큐가 차거나 종료 중이면 WARN `프론트 상세 재생성 큐 포화(또는 종료 중)` 를 남기고 그 요청을 버린다.
- **매일 00:05(KST) 재생성**: 진행 중이거나 최근(어제·그제) 마감한 모집이 있는 동아리 상세를 한 곳씩 다시 만든다. 모집
  상태가 날짜만으로 바뀌고 지원자 수가 움직이는 것을 하루 안에 반영한다(마감 전이는 이틀 대상이라 하루 재시도). 잡은
  `ClubDetailDailyRevalidationJob` 이고, 플래그 `DUING_CLUB_DETAIL_DAILY_REVALIDATE_ENABLED` 는 운영 기본 활성이다.
  정상이면 `ClubDetailDailyRevalidationJob start: targets=N` → 동아리마다 `프론트 재생성 warm-up 응답 — path=/clubs/<id>`
  → `ClubDetailDailyRevalidationJob done: targets=N` 순이다. 요청 실패는 위 상세 WARN 과 같고, 대상 조회 실패는 ERROR
  한 줄이며 다음 날 다시 돈다. 종료 중이면 WARN `종료 중 — 남은 N곳 건너뜀`. `start: targets=N`(N ≥ 1) 바로 뒤에
  `done` 이 오고 그 사이에 `warm-up 응답`·요청 실패 WARN 이 한 줄도 없으면 비밀값 미설정 등으로 트리거가 비활성이다 —
  요청기는 DEBUG 만 남기고 건너뛰므로 부팅 WARN `[프론트 재생성 트리거] 비활성` 을 확인한다.
- **배포 순서**: 백엔드가 프론트(상세 경로 허용 — #1356 프론트)보다 먼저 배포되면 상세 요청은 `HTTP_400`(허용 목록 밖)이다.
  같은 릴리스로 함께 나가면 프론트 배포가 끝날 때까지 400 WARN 이 잠시 날 수 있고 저절로 풀린다. 프론트 없이 백엔드만
  나가면 모든 상세 요청이 400 이므로 프론트를 먼저(또는 같은 릴리스로) 배포한다.

## 런북 — api 트래픽 이상

`TRAFFIC_SURGE_DETECTED` 가 오면 본다. 백엔드가 받은 전체 요청(헬스체크 포함)과 429 응답을 1분마다 세어, 분당 값이 기준
이상인 집계가 2회 이어지면 한 번 알린다. Caddy·Tomcat 단계에서 거절된 요청은 세지 못한다.

1. **정상 몰림인지 먼저 본다** — 가두모집·모집 마감일처럼 사용자가 몰릴 일이 있었는지, 서버가 버티는지(`docker stats`,
   Sentry 5xx, Better Stack) 확인한다. 정상 몰림이고 서버가 버티면 지켜본다.
2. **공격이면** 비상 모드로 간다 — [EDGE-EMERGENCY.md](./EDGE-EMERGENCY.md). 429 축만 높으면 특정 기능 남용(인증 코드 등)일
   가능성이 크다. 레이트리미터가 막고 있는지 Sentry·로그로 본다.
   - 429 가 조회 요청 제한에서 나온 것이면 백엔드 WARN `[조회 요청 제한] 한 IP(대역 a.b.c.x)가 분당 한도(…건)를 넘겨 …` 가
     그 분의 첫 거절마다 한 줄 남는다(`docker compose logs backend | grep '조회 요청 제한'`). IP 는 대역만 남는다 — 접근 로그는
     Caddy·Tomcat 모두 꺼져 있어 이 줄이 유일한 단서다. 대역이 학교 망이면 교내 NAT 의 정상 학생이 잘리는 것이니
     `DUING_RATE_LIMIT_API_READ_PER_MINUTE` 를 올리거나 0 으로 끄고 `docker compose up -d` 한다. `docker compose ps` 의
     healthy 와 함께 같은 grep 의 시작 줄(`[조회 요청 제한] 활성 — 한 IP 분당 …건` / `비활성 — …`)로 적용된 한도를 확인한다 —
     빈 값·오타는 기동을 막지 않고 기본값 1000 으로 켜지므로 healthy 만으로는 값이 적용됐는지 알 수 없다(2026-11-18
     릴리스(main `ef4b79296`) 이미지까지는 빈 값·정수가 아닌 값에서 기동이 실패하고 재시작을 되풀이한다 — 환경변수 표의
     `DUING_RATE_LIMIT_API_READ_PER_MINUTE` 줄 참고). 외부 대역이면 제한이
     일하고 있는 것이다 — 서버가 버티면 지켜본다. 한 IP 의 거절만으로는 분당 429 기준(300)에 닿지 않을 수 있어 이 알림이
     오지 않기도 한다 — 가두모집·OT 처럼 한 곳에 사람이 몰리는 날은 이 로그를 직접 본다.
3. **정상화 알림**(`TRAFFIC_SURGE_RECOVERED`)은 5회 연속 기준 미만일 때 온다. 상태는 메모리라 알림 뒤 재기동(배포)하면
   오지 않는다 — 그때는 재기동 뒤 2회 집계(약 2분) 안에 감지 알림이 다시 오는지 본다. 오지 않으면 가라앉은 것이다.
4. **기준 조정** — 매일 09:00 일간 요약(`TRAFFIC_DAILY_SUMMARY`)의 최대 분당 요청·429 를 1~2주 모아 본다. 평시 최대치의
   몇 배로 기준을 잡아 서버 `.env` 에 넣고 재기동한다. 매시 백엔드 INFO `트래픽 시간 요약 — <날짜> <시>, …` 은 보조 자료다
   (`docker compose logs backend | grep '트래픽 시간 요약'`, 배포 때 사라진다).
   - **조회 요청 제한 한도** — 일간 요약의 `한 IP 분당 최대 조회`(매시 요약 줄 끝에도 같은 문구)는 어느 IP 든 한 분 창에
     보낸 조회의 최대 건수다(IP 는 남지 않는다). 하루치가 아니라 여러 날(모집 기간 포함)의 최대를 본다. 최대의 2배가 한도
     아래면 여유가 있다(두 창으로 나뉘어 잡힌 몰림이 한 창에 들어오면 관측치의 2배까지 될 수 있다). `한도 초과(…건 넘음)` 은 그 분에 거절이 있었다는
     뜻일 뿐 실제로 몇 건을 보냈는지는 알려 주지 않는다 — 그날의 WARN `[조회 요청 제한] 한 IP(대역 …)` 줄로 대역을 본다.
     최대의 주인이 사람이 아닐 수 있다 — Vercel 서버 렌더·헬스체크·외부 감시도 같은 필터를 지난다. 재기동(배포)하면 그
     시·기간의 값은 사라진다. `제한 비활성` 이면 한도가 0 이하라 세지 않은 것이다. 여유가 없으면 한도를 올리는 법은 위 2번
     항목과 환경변수 표의 `DUING_RATE_LIMIT_API_READ_PER_MINUTE` 줄을 본다 — 값을 바꾼 뒤에는 `docker compose up -d`
     (`restart` 는 `.env` 를 다시 읽지 않는다).
5. Slack 이 비활성이거나 전송이 실패해도 백엔드 로그에 WARN `api 트래픽 이상 감지 — …` 가 한 줄 남는다.
6. **09:00 일간 요약이 안 오면** 감지 잡이나 백엔드가 멈췄을 수 있다. 백엔드가 살아 있는지(Better Stack), 시작 로그
   `[트래픽 이상 감지] 활성`·`[Slack 운영 알림] 활성` 이 있는지, 09:00 을 걸친 배포가 있었는지(그날 요약은 없다) 본다.
   백엔드 INFO `트래픽 일간 요약 — …` 이 그 시각에 있으면 잡은 살아 있고 전송만 실패한 것이다(타임아웃·네트워크 오류는
   재시도하지 않는다) — [Slack 알림이 안 올 때](#런북--slack-알림이-안-올-때)로 간다.
   요약이 오지 않은 날은 자동 작업·백업 감시도 없는 날이다 — 카드와 `gh run list --workflow backup.yml --limit 5` 를 직접 본다.

## 런북 — 일간 요약의 자동 작업·백업 경고

09:00 일간 요약(`TRAFFIC_DAILY_SUMMARY`)의 머리말이 `⚠️ api 트래픽 일간 요약 — 자동 작업·백업 확인 필요` 이면 본다. 작업 판정은 총동연 홈
'자동 작업' 카드와 같다(`AdminJobStatusQueryService`). 요약은 **09:00 한 순간의 상태**다 — 그 전에 나빴다가 09:00 전에 회복한 일은 나오지
않고, 즉시 알림은 없다(#1634).

| 작업 키 | 카드 이름 | 주기(KST) | 늦음 기준 · 경고까지 연속 |
|---|---|---|---|
| `RECRUITMENT_AUTO_CLOSE` | 모집 자동 마감 | 매일 00:40 | 마지막 종료 뒤 26시간 · 1회 |
| `APPLICATION_PENDING_REMINDER` | 미처리 지원 리마인더 | 매일 09:30 | 26시간 · 1회 |
| `FACILITY_RESERVATION_CRAWL` | 학교 시설 예약 수집 | 10분마다 | 30분 · 3회 |
| `FACILITY_BOOKING_MATCHING` | 학교 반영 확인 | 10분마다(3분 오프셋) | 30분 · 3회 |
| `FEDERATION_INQUIRY_PURGE` | 문의 보관 기간 파기 | 매일 04:40 | 26시간 · 1회 |

**자동 작업 경고(`⚠️ {작업 키} 늦음·실패·일부 실패`)**
1. 총동연 홈 카드로 지금 상태를 다시 본다. 10분 작업은 09:00 뒤 다음 실행으로 이미 회복했을 수 있다.
2. 그대로면 백엔드 로그에서 그 잡의 WARN·ERROR 를 본다(`docker compose logs --since 24h backend | grep -E 'WARN|ERROR'`). 예외로 끝난
   실행은 ERROR 라 Sentry 에도 있다(예외 없이 실패로 기록되는 실행도 있어 Sentry 에 없을 수 있다). '늦음'이면 배포가 잡 시각을 걸쳤는지(그날 실행은 건너뛴다 — [README](./README.md) 배포 절)도 본다.
3. 꺼짐은 경고가 아니다 — 개수 줄의 `꺼짐 n` 이 뜻밖이면 서버 `.env` 의 잡 켜짐 설정(`MonitoredJob` 의 설정 이름)을 본다.

**백업 경고(`⚠️ 마지막 백업 성공: … (26시간 넘음)` / `기록 없음`)** — 백업 잡(`backup.yml`)은 업로드에 성공하면 `Record backup success`
스텝이 `scheduled_job_run` 의 `DB_BACKUP` 줄을 덮어쓰고, 요약은 그 시각이 요약 시점에서 26시간을 넘었는지 본다.
1. `gh run list --workflow backup.yml --limit 5` — 그날 런이 진행·대기 중이면 기다린다. 예약은 04:15 지만 GitHub 지연으로 실제 완료는
   06:30\~13:31 KST 까지 퍼진다(2026-10 이후 예약 실행 실측). 전날 일찍 돌고 당일 늦게 도는 날(2026-08-07)은 이것만으로 경고가 뜬다.
2. 그날 런이 없거나, 스텝 0개로 몇 초 만에 실패했으면 결제·계정 잠금(체크 런 annotations 에 'account is locked')이거나 워크플로가
   꺼진 것이다. 이 경우 백업 실패 알림도 오지 않는다.
3. 런이 success 인데 경고면 `Record backup success` 스텝의 `::warning::` 을 본다 — 백업은 R2 에 있고 기록만 실패한 것이다. 문구의
   psql 종료 코드가 2 면 연결 실패(풀러·비밀값), 3 이면 SQL 오류(권한·잠금·문장 상한)다. 덤프 롤을 분리했다면(#1323) 이 테이블 쓰기
   권한이 빠진 것이다.
4. 원인을 치운 뒤 `gh workflow run backup.yml` 로 다시 뜬다(RPO 24시간 — [DB-RESTORE.md](./DB-RESTORE.md)).

감지 범위: 이틀 이상 이어지는 공백은 반드시 잡는다. 하루만 빠지면 다음 날 실행이 09:00 뒤에 끝날 때만 잡는다 — 그 전에 끝나면 그 실행이
공백을 덮는다.

**조회 실패(`⚠️ 자동 작업·백업 상태: 조회 실패`)** — 백엔드 WARN `일간 요약 — 자동 작업·백업 상태 조회 실패, reason=…` 을 본다. 대개
그 시각의 DB 장애라 Better Stack 1번 모니터(health)와 함께 본다.
