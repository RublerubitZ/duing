# api 비상 모드 런북 — Cloudflare 프록시 재가동·원본 잠금·되돌리기

> 평상시 `api.duings.com` 은 Cloudflare **DNS 전용(프록시 OFF)** 으로 서버에 직결된다. Cloudflare 무료 플랜이
> 한국 사용자를 미국 콜로(LAX·PDX 등)로 돌려 생기던 지연·타임아웃을 없애기 위해서다(2026-10 실측 직결 0.08초 vs 경유 0.7~1.4초).
> 대신 평소에는 Cloudflare 의 대량 트래픽 흡수(DDoS)·WAF 가 없다. 이 문서는 공격·트래픽 폭증 때 그 보호를
> 몇 분 안에 다시 켜고(**비상 모드**), 끝나면 직결로 되돌리는 절차다. 장애 일반 대응은 [`UPTIME.md`](./UPTIME.md) 의
> "장애 대응 런북" 을 먼저 본다. 모든 단계는 무료 플랜·무료 한도 안에서 한다 — 유료 플랜·유료 WAF·고급 속도 제한은 쓰지 않는다(추가 비용 0원).

## 한눈에 보기

| 순서 | 비상 모드로 | 평상시(직결)로 되돌리기 |
|---|---|---|
| 1 | 서버 Caddy 에 신뢰 블록 복원 — **프록시 켜기 전에** | (AOP 를 켰다면) Caddy 클라이언트 인증서 요구 해제 |
| 2 | SSL/TLS 모드가 전체(Full) 이상인지 확인 → `api` 레코드 프록시 켜기 → Slack 알림 | Lightsail 방화벽 80·443 다시 전체 개방 |
| 3 | **바꾸기 전 TTL 이상**(0절을 안 했으면 자동 = 5분) 지나 DNS 가 바뀐 뒤 Lightsail 방화벽 80·443 을 Cloudflare 대역만 | WAF 규칙 정리 → `api` 레코드 프록시 끄기(DNS 전용), TTL 2분 |
| 4 | (필요 시) Cloudflare WAF 차단 규칙 | **5분 이상** 지나 DNS 가 바뀐 뒤 Slack 알림 → 서버 Caddy 신뢰 블록 제거 |
| 5 | (하루 이상 가면) 저장소 핫픽스 | 핫픽스 되돌리기 |
| 6 | (최후) 고정 IP 교체 | — |
| 7 | (며칠 이상) 원본 인증(AOP) — **아직 준비 안 됨** | — |

**순서를 바꾸면 안 되는 이유**

- **신뢰 블록 없이 프록시를 켜면**: 모든 요청의 연결 상대가 Cloudflare 엣지가 되어, 같은 거점(PoP)을 쓰는 사용자 전원이
  IP 레이트리밋 버킷을 나눠 쓴다. 로그인 실패·휴대폰 인증 발송 등이 무더기로 막힌다(#1112 이전 상태).
- **SSL/TLS 모드가 유연(Flexible)인 채로 프록시를 켜면**: Cloudflare 가 원본에 HTTP 로 붙고 Caddy 가 HTTPS 로 되돌려 보내
  리다이렉트가 끝없이 돈다(api 전체 장애).
- **DNS 가 다 바뀌기 전에 방화벽을 잠그면**: 아직 직결로 들어오는 사용자가 막힌다(장애).
- **되돌릴 때 방화벽을 열기 전에 프록시를 끄면**: 직결 사용자가 막힌다. **프록시가 켜진 채로 신뢰 블록을 지우면** #1112 회귀다.
- **AOP 를 켠 채로 프록시를 끄면**: 클라이언트 인증서가 없는 브라우저가 전부 거절된다.

## 언제 비상 모드로 가나

아래가 지속되면 공격·폭증으로 보고 전환을 검토한다.

- `#duing-monitoring` 에 `🚨 api 트래픽 이상 — 비상 모드 검토`(`TRAFFIC_SURGE_DETECTED`)가 왔다 — 정상 몰림인지부터
  [MONITORING.md 런북](./MONITORING.md#런북--api-트래픽-이상) 순서로 확인한다.
- Better Stack 1·2번(api) 다운·지연 알림이 반복되는데, `UPTIME.md` 분류상 DB·앱 문제가 아니라 VM/Caddy 쪽이다.
- 서버 부하가 치솟는다. SSH 접속 뒤:
  - `docker stats --no-stream` — caddy·backend CPU·메모리
  - `docker compose exec -T caddy netstat -tn | grep -c ESTABLISHED` — Caddy 의 연결 수 급증
    (호스트의 `ss` 는 Caddy 컨테이너의 연결을 보지 못한다 — Docker 가 80·443 을 컨테이너로 넘겨 소켓이 컨테이너 안에 있다)
  - Lightsail 콘솔 지표 — CPU·NetworkIn 급증
- 백엔드 로그에 여러 IP 의 429 가 쏟아지거나 Sentry 5xx 가 급증한다.

정상 사용자가 몰린 것(가두모집 등)이라면 비상 모드가 해법이 아니다. 느린 연결은 Caddy 연결 시간 상한(#1394)이 끊는다.

## 0. 평시에 해 둘 것

- Cloudflare·Lightsail 콘솔에 바로 로그인할 수 있는 사람이 최소 1명(2단계 인증 포함).
- 서버 SSH: `ssh ubuntu@<서버 IP>` → 배포 디렉터리 `/home/ubuntu/duing`(저장소 시크릿 `DEPLOY_DIR` 이 있으면 그 값).
- `api` 레코드 TTL 을 2분으로 둔다. TTL 은 DNS 전용일 때만 고칠 수 있다(2026-10-07 2분으로 바꿈 — 권한 네임서버 응답 TTL 120 확인).
- Cloudflare SSL/TLS 암호화 모드가 **전체(Full)** 이상인지 가끔 확인한다(2026-10-07 부터 **전체(엄격)**).
- 분기마다 [부록 A](#부록-a-cloudflare-대역-2026-10-07) 가 최신인지 https://www.cloudflare.com/ips-v4 · ips-v6 와 대조한다.

## 1. 비상 모드로 전환

### 1-1. 서버 Caddy 에 신뢰 블록 복원 (프록시 켜기 전에)

먼저 지금 상태를 본다(서버에서).

```bash
cd /home/ubuntu/duing
docker compose ps caddy    # caddy 가 Up 인지 먼저 본다
docker compose exec -T caddy curl -s localhost:2019/config/apps/http/servers | grep -o '"client_ip_headers":\[[^]]*\]' || echo "신뢰 블록 없음(또는 조회 실패)"
```

`"client_ip_headers":["Cf-Connecting-Ip"]` 가 나오면 이미 있다. 1-2 로 넘어간다. 없으면 아래를 그대로 실행한다.

```bash
cd /home/ubuntu/duing
cp Caddyfile Caddyfile.before-emergency
CF_RANGES="$( { curl -fsS https://www.cloudflare.com/ips-v4; echo; curl -fsS https://www.cloudflare.com/ips-v6; } | tr -s '[:space:]' ' ' | sed 's/^ //;s/ $//')"
echo "$CF_RANGES" | wc -w    # 20 이상이어야 한다(2026-10 기준 22)
awk -v ranges="$CF_RANGES" '{ print } $0 == "\tservers {" && !done { print "\t\ttrusted_proxies static " ranges; print "\t\tclient_ip_headers Cf-Connecting-Ip"; done = 1 }' Caddyfile > /tmp/Caddyfile.emergency
grep -cE '^[[:space:]]+client_ip_headers Cf-Connecting-Ip$' /tmp/Caddyfile.emergency    # 1 이어야 한다
docker compose exec -T caddy caddy validate --config - --adapter caddyfile < /tmp/Caddyfile.emergency
cp /tmp/Caddyfile.emergency Caddyfile
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose exec -T caddy curl -s localhost:2019/config/apps/http/servers | grep -o '"client_ip_headers":\[[^]]*\]'
```

- 마지막 줄에 `"client_ip_headers":["Cf-Connecting-Ip"]` 가 나와야 반영된 것이다. reload 성공 메시지만으로는 반영의 증거가 아니다.
  - 안 나오면 컨테이너가 옛 파일(inode)을 보고 있는 것이다(2026-08-30 사례). `docker compose up -d --force-recreate caddy` 뒤 다시 되읽는다.
    인증서는 `caddy_data` 볼륨에 있어 재발급되지 않고, 끊김은 수 초다.
- **`cp` 로 덮어쓴다.** Caddyfile 은 단일 파일 bind mount 라 inode 가 바뀌면 컨테이너가 옛 파일을 계속 본다. `mv` 나 편집기로 직접 저장하지 않는다.
- 검증은 **지금 돌고 있는 Caddy** 로 한다. 따로 받아 둔 이미지는 운영과 버전이 다를 수 있다(2026-10 기준 운영 2.11.4 — 버전마다 받는 옵션이 다르다).
  caddy 컨테이너가 죽어 있으면 `docker run --rm -i <docker-compose.yml 의 caddy 이미지> caddy validate --config - --adapter caddyfile < …` 로 대신한다.
- `wc -w` 가 20 미만이면(Cloudflare 목록을 못 받음) [부록 A](#부록-a-cloudflare-대역-2026-10-07) 의 IPv4·IPv6 22개를 공백으로 이어 `CF_RANGES` 에 직접 넣는다.
- `grep -c` 가 1 이 아니면 자동 삽입이 안 된 것이다. `cp Caddyfile /tmp/Caddyfile.emergency` 로 사본을 다시 만들어 편집기로 고친 뒤, 위 명령의 `docker run … validate` 줄부터 이어서 실행한다.
  - 전역 블록의 `servers {` 바로 아래에 두 줄을 넣는다.
  - 전역 블록 자체가 없으면 머리 주석 다음, `api.duings.com {` 앞에 아래 블록을 새로 만든다.

    ```
    {
    	servers {
    		trusted_proxies static <부록 A 의 22개 대역을 공백으로 이어서>
    		client_ip_headers Cf-Connecting-Ip
    	}
    }
    ```

  - 이미 신뢰 줄이 있는데 또 넣으면 `caddy validate` 가 "specified more than once" 로 막는다.
- 이제 서버 파일만 바뀌었다. 저장소 파일로 서버를 덮어쓰는 **Deploy Backend 실행을 1-5 핫픽스 전까지 하지 않는다.**
  - main push(릴리스 포함), 지난 실행의 re-run, 수동 실행 모두 해당한다. 릴리스·배포가 필요하면 1-5 핫픽스를 먼저 한다.
  - 1-5 뒤 수동 실행할 때는 ref 를 반드시 main 으로 고른다 — 저장소 기본 브랜치가 develop 이다(`gh workflow run deploy-backend.yml --ref main`).
  - **비상 모드 중 백엔드 롤백은 지난 실행 re-run 으로 하지 않는다.** re-run 은 그 실행 당시 커밋의 Caddyfile 을 다시 올리므로, 1-5 핫픽스
    이전 실행이면 신뢰 블록이 없는 파일이 내려가 #1112 회귀가 난다. 대신 서버 `.env` 의 `BACKEND_IMAGE` 만 직전 태그로 되돌리고
    `docker compose up -d backend` 한다(Caddyfile 은 건드리지 않는다 — `deploy/README.md` 의 롤백 절차).
    - 직전 태그(커밋 SHA)는 서버에 남아 있는 이미지에서 찾는다 — 배포 때 정리는 태그 없는 이미지만 지운다.
      `docker images ghcr.io/rublerubitz/duing-backend --format '{{.Tag}}\t{{.CreatedAt}}'` 에서 지금 `.env` 값 바로 다음(두 번째로 새것)이 직전 태그다.
    - 롤백 뒤 `docker compose ps backend` 가 healthy 인지 보고, 위 관리 API 되읽기 줄로 `"client_ip_headers":["Cf-Connecting-Ip"]` 가 그대로인지 확인한다.

### 1-2. Cloudflare 프록시 켜기

1. 대시보드 → `duings.com` → **SSL/TLS** → 개요: 암호화 모드가 **전체(Full)** 또는 **전체(엄격)** 인지 확인한다.
   - 유연(Flexible)·끔이면 먼저 전체로 올린다. 그대로 프록시를 켜면 리다이렉트 루프로 api 가 전부 멈춘다.
   - 원본 인증서(Let's Encrypt, Caddy 자동 갱신)가 정상이라 전체(엄격)도 된다. 이 모드는 프록시를 타는 호스트(지금은 `files`)에만 적용되고, 필요하면 구성 규칙(Configuration Rules, 무료)으로 api 에만 따로 지정할 수 있다.
2. **DNS** → 레코드 → `api` 편집 → **켜기 직전 편집 화면의 TTL 값을 적어 둔다**(1-3 은 그 시간 이상 지난 뒤에 한다 — 자동이면 5분) → 프록시 상태를 켠다(주황 구름) → 저장. TTL 은 "자동(300초)" 으로 바뀐다.
   - 다른 레코드(`duings.com`·`files`)는 건드리지 않는다.
3. 확인 — 적어 둔 TTL 이 지난 뒤, 로컬에서:
   - `dig @1.1.1.1 +short api.duings.com` · `dig @8.8.8.8 +short api.duings.com` · `dig @168.126.63.1 +short api.duings.com`(KT) → 모두 Cloudflare IP(104.21.x·172.67.x 등)
   - `curl -s -D - -o /dev/null https://api.duings.com/actuator/health | grep -i cf-ray` → 값이 있다
4. **Slack 에 알린다**(서버에서). 운영 알림 웹훅(`.env` 의 `SLACK_WEBHOOK_URL`, `#duing-monitoring`)으로 보낸다.

   ```bash
   cd /home/ubuntu/duing
   SLACK_WEBHOOK_URL="$(grep -E '^SLACK_WEBHOOK_URL=' .env | cut -d= -f2- | tr -d '"')"
   MESSAGE="🛡️ [api 비상 모드 진입] Cloudflare 프록시를 켰다 — 사유: <한 줄> / 담당: <이름> / 런북: deploy/EDGE-EMERGENCY.md"
   curl -fsS -X POST -H 'Content-Type: application/json' --data "$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1]}))' "$MESSAGE")" "$SLACK_WEBHOOK_URL"; echo
   ```

   - `ok` 가 찍히면 보내진 것이다. 웹훅 주소는 비밀값이라 화면 공유·채팅에 붙여 넣지 않는다.
   - 사유·담당에는 큰따옴표(")를 쓰지 않는다. 셸 문자열이 끊긴다(JSON 변환은 python3 가 처리한다).

### 1-3. 원본 잠금 — Lightsail 방화벽을 Cloudflare 대역만

1. 먼저 직결 손님이 빠졌는지 본다.
   - 1-2 의 `dig` 세 개가 모두 Cloudflare IP 를 돌려줘야 한다.
   - 서버에서 아래를 실행해 나오는 연결 상대 주소가 거의 다 [부록 A](#부록-a-cloudflare-대역-2026-10-07) 대역인지 본다.
     호스트의 `ss` 로는 Caddy 컨테이너의 연결이 보이지 않아(빈 출력) "직결 손님 없음" 으로 잘못 읽게 된다.

     ```bash
     cd /home/ubuntu/duing
     docker compose exec -T caddy netstat -tn | awk '$4 ~ /:443$/ && $6 == "ESTABLISHED" {print $5}'
     ```

   - 아니면 1~2분 더 기다린다. 먼저 잠그면 아직 직결로 오는 사용자가 막힌다.
2. Lightsail 콘솔 → 인스턴스 → **네트워킹** → **IPv4 방화벽**
   - HTTPS(443): "IP 주소로 제한" → [부록 A](#부록-a-cloudflare-대역-2026-10-07) 의 IPv4 15개 대역.
   - HTTP(80): 같은 방식으로 제한한다. 인증서 갱신 확인 요청도 Cloudflare 를 거쳐 들어온다.
   - 한 규칙에 출발지를 30개까지 넣을 수 있고, IPv4 규칙 한도는 출발지 기준 60개다(15개 × 2포트 = 30).
   - SSH(22)는 그대로 둔다. 배포 CD 가 GitHub 러너에서 접속한다.
3. **저장 뒤 포트마다 15개 대역이 모두 보이는지 센다.** 빠진 대역은 그 엣지를 타는 사용자에게만 간헐적인 522 오류로 나타나 알아채기 어렵다.
   - 저장되지 않는 대역이 있으면(`104.24.0.0/14` 가 안 들어간 사례 보고) `/15` 둘로 쪼개 넣는다. 예: `104.24.0.0/15`·`104.26.0.0/15`.
4. **IPv6 방화벽**: 80 규칙(현재 유일한 IPv6 규칙)을 지운다. 443 은 원래 IPv4 만 열려 있다. api 는 AAAA 레코드가 없어 Cloudflare 도 IPv4 로 접속한다.
5. 서버 안의 ufw 가 아니라 **Lightsail 방화벽**에서 한다. Docker 가 ufw 를 우회해 게시 포트를 열기 때문이다.
6. 확인(로컬, Cloudflare 가 아닌 회선에서):
   - `curl -s -o /dev/null -w '%{http_code}\n' --max-time 5 --resolve api.duings.com:443:<서버 IP> https://api.duings.com/actuator/health` → `000`(막힘)
   - `curl -s -o /dev/null -w '%{http_code}\n' https://api.duings.com/actuator/health` → `200`(Cloudflare 경유 정상)

### 1-4. (필요 시) Cloudflare WAF 로 막기

- **api 에는 챌린지를 쓰지 않는다.** "I'm Under Attack"·관리형 챌린지·JS 챌린지는 브라우저가 페이지로 열 때만 풀린다. 프론트의 API 호출(fetch)은 전부 실패한다. api 에는 **차단(Block)** 만 쓴다.
- **Bot Fight Mode 는 켜지 않는다.** WAF 규칙으로 예외를 둘 수 없고, Vercel 서버 렌더·Better Stack 같은 API 호출까지 챌린지한다.
- 보안 → WAF → **사용자 지정 규칙**(무료 5개, 1개는 files 이미지 차단이 쓰는 중 — 건드리지 않는다)
  - 공격 IP·ASN·User-Agent 를 차단한다. 조건에 `http.host eq "api.duings.com"` 을 함께 건다.
  - 며칠 이상 둘 규칙에는 `and not starts_with(http.request.uri.path, "/.well-known/acme-challenge/")` 를 붙인다.
    프록시 중에는 인증서 갱신 확인(HTTP-01)이 Cloudflare 를 거쳐 여러 지점에서 들어와, 국가·ASN 차단에 걸릴 수 있다.
- **속도 제한 규칙**(무료 1개)
  - 무료 플랜은 조건에 경로(Path)와 검증된 봇 여부만 쓸 수 있고 호스트로는 못 거른다. IP 기준이고, 집계·차단 시간은 10초로 고정이다.
  - 경로로 건다(예: 로그인·인증 발송 경로). 존의 다른 프록시 호스트에 같은 경로가 있으면 함께 걸린다는 점을 감안한다.
- 국가 차단은 신중히 한다. Vercel 서버 렌더와 Better Stack 모니터가 해외에서 올 수 있다.
- WAF 규칙은 프록시가 켜져 있을 때만 적용된다.

### 1-5. (하루 이상 가면) 저장소 핫픽스

1-1 은 서버 파일만 바꿨다. Deploy Backend 가 한 번이라도 돌면 저장소 파일로 덮어써 신뢰 블록이 사라지고 #1112 회귀가 난다. 저장소에도 같은 상태를 넣는다.

- 저장소에 넣을 것은 두 가지다. ① `deploy/Caddyfile` 전역 `servers {` 블록에 1-1 과 같은 두 줄(최신 Cloudflare 대역)
  ② `.github/workflows/deploy-config-ci.yml` 첫 단언을 #1112(`1d960e0d4`)의 존재 단언으로 되돌리기. 이 두 파일만 바꾼다 — 신뢰 블록을 지운
  #1395 의 squash 커밋을 통째로 `git revert` 하지 않는다(그 커밋에는 이 런북의 1-5·2-6 안내도 들어 있어, 되돌리면 이 절차 안내까지 함께 되돌아간다).
- **develop 에 아직 릴리스하지 않은 변경이 없으면**: 위 두 변경을 develop PR 로 머지한 뒤 main 으로 승격한다.
- **미릴리스 변경이 있으면**: 공격 중에 그것까지 내보내지 않도록, main 에서 분기한 핫픽스 PR(→ main)로 위 두 변경만 올린다. 같은 변경을 develop 에도 PR 로 반영한다.
- 핫픽스 배포(Deploy Backend)는 백엔드 컨테이너도 다시 만들어 수십 초 끊긴다. 공격이 잦아든 틈에 한다.

### 1-6. (최후) 고정 IP 교체

공격자가 서버 IP 를 직접 때려 대역폭이 찰 때 쓴다. 방화벽은 연결은 막아도, IP 로 쏟아지는 대량 패킷 자체는 막지 못한다.

1. Lightsail → **네트워킹** → 고정 IP 를 새로 만든다.
2. 인스턴스에는 고정 IP 를 하나만 붙일 수 있다. 기존 고정 IP 를 분리하고 새 고정 IP 를 연결한다.
   분리하는 순간 옛 IP 로 연 SSH 가 끊기므로 Lightsail 콘솔에서 한다.
3. Cloudflare `api` 레코드 값을 새 IP 로 바꾼다(프록시 켠 채로).
4. 옛 고정 IP 는 바로 해제한다. 인스턴스에 붙어 있지 않은 고정 IP 는 1시간이 지나면 과금된다.
5. 저장소 시크릿 `LIGHTSAIL_HOST` 가 IP 면 새 IP 로 바꾼다. 배포 CD 와 운영 SSH 가 쓴다.
6. 방화벽 규칙(1-3)은 인스턴스에 붙어 있으니 교체 뒤에도 그대로인지 확인한다.

새 IP 는 1-3 잠금이 유지되는 한 Cloudflare 밖에서 api 인증서를 보여 주지 않아 다시 찾기 어렵다. 평상시(직결)로 돌아가면 다시 드러난다.

### 1-7. (며칠 이상 유지할 때) 원본 인증(AOP) — 아직 준비 안 됨

- 1-3 방화벽은 "우리 존" 이 아니라 **Cloudflare 고객 전체**를 허용한다. 공격자가 자기 Cloudflare 존을 우리 서버로 겨누면 방화벽을 통과하고 `Cf-Connecting-Ip` 를 마음대로 정할 수 있다. 그러면 IP 기준 레이트리밋이 우회된다(#1329).
- 닫는 방법: **존 전용 인증서**로 Authenticated Origin Pulls 를 켜고, Caddy 가 그 인증서가 없는 연결을 거절하게 한다.
  - Caddy 쪽은 Caddyfile `tls { client_auth { … } }` 설정과 인증서 파일 마운트가 필요하다.
  - Cloudflare 공용 인증서는 모든 고객이 같이 쓰므로 소용없다.
- **현재 준비돼 있지 않다.** 인증서 생성·Cloudflare 등록·Caddy 설정·compose 마운트를 미리 만들어 리허설해 두는 게 후속 과제다. 비상 모드가 며칠 이상 가면 이것부터 한다.
- 켰다면 되돌릴 때 **프록시를 끄기 전에** Caddy 의 클라이언트 인증서 요구부터 해제한다(2-1).

## 2. 평상시(직결)로 되돌리기

공격이 끝나고 충분히 안정되면(예: 24시간 이상 정상) 아래 순서로 되돌린다.

1. **(AOP 를 켰다면)** Caddy 의 클라이언트 인증서 요구를 빼고 reload → 관리 API 로 확인한다.
2. **Lightsail 방화벽 다시 열기**
   - IPv4 80·443 의 "IP 주소로 제한" 을 풀어 전체 허용으로 한다.
   - IPv6 80 규칙을 되살린다.
   - 확인: 1-3 의 `--resolve` 직결 curl 이 `200`.
3. **WAF 규칙 정리, 프록시 끄기**
   - 1-4 의 WAF 규칙은 프록시를 끄면 효력이 없으니 지운다.
   - `api` 레코드 프록시를 끄고(DNS 전용) TTL 을 2분으로 둔다.
4. **바꾸기 전 TTL(자동 = 300초)이 지나 DNS 가 바뀐 뒤 확인한다.** 끈 뒤 **5분 이상** 기다린다.
   - `dig @1.1.1.1 +short api.duings.com` · `dig @8.8.8.8 +short api.duings.com` · `dig @168.126.63.1 +short api.duings.com`(KT) → 모두 서버 IP
   - `curl -s -D - -o /dev/null https://api.duings.com/actuator/health | grep -i cf-ray` → 빈 출력
   - 확인되면 Slack 에 알린다. 1-2 의 4번 명령에서 `MESSAGE` 만 바꿔 실행한다.
     예: `MESSAGE="✅ [api 직결 복귀] Cloudflare 프록시를 껐다 — 비상 모드 기간: <시작~끝> / 담당: <이름>"`
5. **서버 Caddy 에서 신뢰 블록 제거**

   ```bash
   cd /home/ubuntu/duing
   cp Caddyfile Caddyfile.before-revert
   grep -vE '^[[:space:]]+(trusted_proxies static |client_ip_headers Cf-Connecting-Ip$)' Caddyfile > /tmp/Caddyfile.direct
   docker compose exec -T caddy caddy validate --config - --adapter caddyfile < /tmp/Caddyfile.direct
   cp /tmp/Caddyfile.direct Caddyfile
   docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   servers_json=$(docker compose exec -T caddy curl -sf localhost:2019/config/apps/http/servers) || echo "조회 실패"
   echo "$servers_json" | grep -c '"client_ip_headers"'    # 0 이어야 한다
   ```

   - `0` 이 아니면 아직 반영되지 않은 것이다. 1-1 처럼 `docker compose up -d --force-recreate caddy` 뒤 다시 되읽는다.
   - "조회 실패" 가 찍히면 관리 API 를 못 읽은 것이다(`0` 이 함께 나와도 믿지 않는다). `docker compose ps caddy` 부터 본다.
6. **저장소**
   - 1-5 핫픽스를 했다면 그 PR 을 되돌리는 PR(`git revert` — 두 파일만 바뀐다: 신뢰 블록 제거 + 부재 단언)을 머지하고 main 으로 승격한다.
   - 핫픽스를 하지 않았다면 5번 결과가 이미 저장소 파일과 같다.
7. **사후 기록**: 타임라인(감지 → 전환 → 복구), 공격 형태, 다음에 바꿀 점을 남긴다. `UPTIME.md` 런북 5번과 같은 방식이다.

## 3. 확인 명령 모음

| 확인 | 명령 | 기대 |
|---|---|---|
| 지금 DNS | `dig @1.1.1.1 +short api.duings.com`, `dig @8.8.8.8 …`, `dig @168.126.63.1 …`(KT) | 직결: 서버 IP / 비상 모드: Cloudflare IP |
| Cloudflare 경유 여부 | `curl -s -D - -o /dev/null https://api.duings.com/actuator/health \| grep -i cf-ray` | 비상 모드면 값 있음, 직결이면 없음 |
| Caddy 구동 설정 | (서버) `docker compose exec -T caddy curl -s localhost:2019/config/apps/http/servers` | 신뢰 블록 유무, 시간 상한(`read_header_timeout: 10000000000` 등) |
| 원본 직접 접속 | `curl -s -o /dev/null -w '%{http_code}\n' --max-time 5 --resolve api.duings.com:443:<서버 IP> https://api.duings.com/actuator/health` | 잠금 중 `000`, 평시 `200` |
| 443 연결 상대 | (서버) `docker compose exec -T caddy netstat -tn \| awk '$4 ~ /:443$/ && $6 == "ESTABLISHED" {print $5}'` | 비상 모드면 거의 다 부록 A 대역 |
| 서버 부하 | (서버) `docker stats --no-stream`, `docker compose exec -T caddy netstat -tn \| grep -c ESTABLISHED` | — |

- 컨테이너 안에서 `wget localhost:2019` 는 `::1` 로 풀려 거부된다. `curl` 을 쓰거나 `127.0.0.1` 로 적는다.
- 수동 `caddy reload` 에는 `--config /etc/caddy/Caddyfile --adapter caddyfile` 이 꼭 필요하다. 이미지 작업 디렉터리가 `/srv` 라 없으면 설정 파일을 찾지 못한다.

## 부록 A. Cloudflare 대역 (2026-10-07)

최신 목록은 https://www.cloudflare.com/ips-v4 · https://www.cloudflare.com/ips-v6 .

IPv4 (15) — 1-3 방화벽과 1-1 신뢰 블록에 쓴다.

```
173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22
```

IPv6 (7) — 1-1 신뢰 블록에만 쓴다(방화벽은 IPv4 만).

```
2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32
```
