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

시간 줄: `USER_REGISTERED` 만 가입 트랜잭션 시각(가입시간), 나머지는 리스너 수신 시각(발행과 ms 차이).

의도적으로 싣는 개인정보: **이름·학번·UserId**(회원가입). 절대 싣지 않는 것: 이메일(수집 안 함)·전화번호·비밀번호·JWT/refresh/cookie/Authorization·요청 바디·계좌번호·예금주·자유 텍스트 사유.

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

## 설정

| 위치 | 키 | 값 |
|---|---|---|
| 서버 `deploy/.env` | `SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL. 미설정/빈 값이면 **비활성으로 부팅**하고 시작 로그에 `[Slack 운영 알림] 비활성` WARN 한 줄(부팅 실패 아님 — 모니터링이 배포를 깨지 않게) |
| GitHub Secrets | `SLACK_WEBHOOK_URL` | 배포 결과 알림용(선택 — 없으면 스텝 생략) |
| 로컬 `backend/.env` | `SLACK_WEBHOOK_URL` | 비워 둔다. 운영 webhook 을 로컬에서 쓰지 말 것 |

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
