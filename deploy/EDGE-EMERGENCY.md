# api 비상 모드 런북 — Cloudflare 프록시 재가동·원본 잠금·되돌리기

> 평상시 `api.duings.com` 은 Cloudflare **DNS 전용(프록시 OFF)** 으로 서버에 직결된다. Cloudflare 무료 플랜이
> 한국 사용자를 미국 콜로(LAX·PDX)로 돌려 생기던 지연·타임아웃을 없애기 위해서다(2026-10, 직결 0.08초 vs 경유 0.7~1.4초).
> 대신 평소에는 Cloudflare 의 대량 트래픽 흡수(DDoS)·WAF 가 없다. 이 문서는 공격·트래픽 폭증 때 그 보호를
> 몇 분 안에 다시 켜고(**비상 모드**), 끝나면 직결로 되돌리는 절차다. 장애 일반 대응은 [`UPTIME.md`](./UPTIME.md) 의
> "장애 대응 런북" 을 먼저 본다.
>
> ⚠️ 작성 시점(2026-10-07)에는 아직 DNS 전환과 Caddy 신뢰 블록 제거(#1395)가 운영에 나가기 전이다. 그동안은
> 1-1 의 확인에서 신뢰 블록이 이미 있다고 나오므로 복원 단계를 건너뛴다.

## 한눈에 보기

| 순서 | 비상 모드로 | 평상시(직결)로 되돌리기 |
|---|---|---|
| 1 | 서버 Caddy 에 신뢰 블록 복원 — **프록시 켜기 전에** | Lightsail 방화벽 80·443 다시 전체 개방 |
| 2 | Cloudflare `api` 레코드 프록시 켜기 | Cloudflare `api` 레코드 프록시 끄기(DNS 전용), TTL 2분 |
| 3 | DNS 가 다 바뀐 뒤 Lightsail 방화벽 80·443 을 Cloudflare 대역만 | DNS 가 다 바뀐 뒤 서버 Caddy 신뢰 블록 제거 |
| 4 | (필요 시) Cloudflare WAF 차단 규칙 | WAF 규칙 정리 |
| 5 | (하루 이상 가면) 저장소 핫픽스 | 핫픽스 되돌리기 |
| 6 | (최후) 고정 IP 교체 | — |

**순서를 바꾸면 안 되는 이유**

- **신뢰 블록 없이 프록시를 켜면**: 모든 요청의 연결 상대가 Cloudflare 엣지가 되어, 같은 거점(PoP)을 쓰는 사용자 전원이
  IP 레이트리밋 버킷을 나눠 쓴다. 로그인 실패·휴대폰 인증 발송 등이 무더기로 막힌다(#1112 이전 상태).
- **프록시가 다 퍼지기 전에 방화벽을 잠그면**: 아직 직결로 들어오는 사용자가 막힌다(장애).
- **되돌릴 때 방화벽을 열기 전에 프록시를 끄면**: 직결 사용자가 막힌다. **프록시가 켜진 채로 신뢰 블록을 지우면** #1112 회귀다.

## 언제 비상 모드로 가나

아래가 지속되면 공격·폭증으로 보고 전환을 검토한다.

- Better Stack 1·2번(api) 다운·지연 알림이 반복되는데, `UPTIME.md` 분류상 DB·앱 문제가 아니라 VM/Caddy 쪽이다.
- 서버 부하가 치솟는다. SSH 접속 뒤:
  - `docker stats --no-stream` — caddy·backend CPU·메모리
  - `ss -s` — TCP 연결 수 급증
  - Lightsail 콘솔 지표 — CPU·NetworkIn 급증
- 백엔드 로그에 여러 IP 의 429 가 쏟아지거나 Sentry 5xx 가 급증한다.

정상 사용자가 몰린 것(가두모집 등)이라면 비상 모드가 해법이 아니다. 느린 연결은 Caddy 연결 시간 상한(#1394)이 이미 끊는다.

## 0. 평시에 해 둘 것

- Cloudflare·Lightsail 콘솔에 바로 로그인할 수 있는 사람이 최소 1명(2단계 인증 포함).
- 서버 SSH: `ssh ubuntu@<서버 IP>` → 배포 디렉터리 `/home/ubuntu/duing`(저장소 시크릿 `DEPLOY_DIR` 이 있으면 그 값).
- `api` 레코드 TTL 을 2분으로 둔다. TTL 은 DNS 전용일 때만 고칠 수 있다.
- 분기마다 [부록 A](#부록-a-cloudflare-대역-2026-10-07) 가 최신인지 https://www.cloudflare.com/ips-v4 · ips-v6 와 대조한다.

## 1. 비상 모드로 전환

### 1-1. 서버 Caddy 에 신뢰 블록 복원 (프록시 켜기 전에)

먼저 지금 상태를 본다(서버에서).

```bash
cd /home/ubuntu/duing
docker compose exec -T caddy curl -s localhost:2019/config/apps/http/servers | grep -o '"client_ip_headers":\[[^]]*\]' || echo "신뢰 블록 없음"
```

`"client_ip_headers":["Cf-Connecting-Ip"]` 가 나오면 이미 있다. 1-2 로 넘어간다. 없으면 아래를 그대로 실행한다.

```bash
cd /home/ubuntu/duing
cp Caddyfile Caddyfile.before-emergency
CF_RANGES="$( { curl -fsS https://www.cloudflare.com/ips-v4; echo; curl -fsS https://www.cloudflare.com/ips-v6; } | tr -s '[:space:]' ' ' | sed 's/^ //;s/ $//')"
echo "$CF_RANGES" | wc -w    # 20 이상이어야 한다(2026-10 기준 22)
awk -v ranges="$CF_RANGES" '{ print } $0 == "\tservers {" && !done { print "\t\ttrusted_proxies static " ranges; print "\t\tclient_ip_headers Cf-Connecting-Ip"; done = 1 }' Caddyfile > /tmp/Caddyfile.emergency
grep -cE '^[[:space:]]+client_ip_headers Cf-Connecting-Ip$' /tmp/Caddyfile.emergency    # 1 이어야 한다
docker run --rm -i caddy:2-alpine caddy validate --config - --adapter caddyfile < /tmp/Caddyfile.emergency
cp /tmp/Caddyfile.emergency Caddyfile
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose exec -T caddy curl -s localhost:2019/config/apps/http/servers | grep -o '"client_ip_headers":\[[^]]*\]'
```

- 마지막 줄에 `"client_ip_headers":["Cf-Connecting-Ip"]` 가 나와야 반영된 것이다.
  - reload 성공 메시지만으로는 반영의 증거가 아니다(2026-08-30 inode 고착 사례).
- **`cp` 로 덮어쓴다.** Caddyfile 은 단일 파일 bind mount 라 inode 가 바뀌면 컨테이너가 옛 파일을 계속 본다. `mv` 나 편집기로 직접 저장하지 않는다.
- `wc -w` 가 20 미만이면(Cloudflare 목록을 못 받음) [부록 A](#부록-a-cloudflare-대역-2026-10-07) 를 `CF_RANGES` 에 직접 넣는다.
- `grep -c` 가 1 이 아니면 전역 `servers {` 블록을 못 찾은 것이다. 편집기로 사본(`/tmp/Caddyfile.emergency`)을 고친 뒤 다시 검증한다.
- 이제 서버 파일만 바뀌었다. **다음 main 배포가 저장소 파일로 덮어쓴다** — 1-5 핫픽스 전까지 main 배포(Deploy Backend)를 돌리지 않는다.

### 1-2. Cloudflare 프록시 켜기

- 대시보드 → `duings.com` → **DNS** → 레코드 → `api` 편집 → 프록시 상태를 켠다(주황 구름) → 저장. TTL 은 "자동" 으로 바뀐다.
- 다른 레코드(`duings.com`·`files`)는 건드리지 않는다.
- 확인(TTL 2분 뒤, 로컬):
  - `dig +short api.duings.com` → Cloudflare IP(104.21.x·172.67.x 등)
  - `curl -s -D - -o /dev/null https://api.duings.com/actuator/health | grep -i cf-ray` → 값이 있다

### 1-3. 원본 잠금 — Lightsail 방화벽을 Cloudflare 대역만

- 1-2 의 `dig` 가 Cloudflare IP 를 돌려준 뒤에 한다. 먼저 잠그면 아직 직결로 오는 사용자가 막힌다.
- Lightsail 콘솔 → 인스턴스 → **네트워킹** → **IPv4 방화벽**
  - HTTPS(443): "IP 주소로 제한" → [부록 A](#부록-a-cloudflare-대역-2026-10-07) 의 IPv4 15개 대역.
  - HTTP(80): 같은 방식으로 제한한다. 인증서 갱신 확인 요청도 Cloudflare 를 거쳐 들어온다.
  - SSH(22)는 그대로 둔다. 배포 CD 가 GitHub 러너에서 접속한다.
  - 한 규칙에 여러 대역을 넣을 수 없으면 대역마다 같은 포트 규칙을 추가한다.
- **IPv6 방화벽**: 80·443 규칙을 지운다. api 는 AAAA 레코드가 없어 Cloudflare 도 IPv4 로 접속한다.
- 서버 안의 ufw 가 아니라 **Lightsail 방화벽**에서 한다. Docker 가 ufw 를 우회해 게시 포트를 열기 때문이다.
- 확인(로컬, Cloudflare 가 아닌 회선에서):
  - `curl -s -o /dev/null -w '%{http_code}\n' --max-time 5 --resolve api.duings.com:443:<서버 IP> https://api.duings.com/actuator/health` → `000`(막힘)
  - `curl -s -o /dev/null -w '%{http_code}\n' https://api.duings.com/actuator/health` → `200`(Cloudflare 경유 정상)

### 1-4. (필요 시) Cloudflare WAF 로 막기

- **api 에는 챌린지를 쓰지 않는다.** "I'm Under Attack"·관리형 챌린지·JS 챌린지는 브라우저가 페이지로 열 때만 풀린다. 프론트의 API 호출(fetch)은 전부 실패한다. api 에는 **차단(Block)** 만 쓴다.
- 보안 → WAF → **사용자 지정 규칙**(무료 5개, 1개는 files 이미지 차단이 쓰는 중 — 건드리지 않는다)
  - 공격 IP·ASN·User-Agent 를 차단한다. 조건에 `http.host eq "api.duings.com"` 을 함께 건다.
- **속도 제한 규칙**(무료 1개): `api.duings.com` 대상, IP 기준. 무료 플랜의 기간·차단 시간 선택지는 대시보드에서 확인한다.
- 국가 차단은 신중히 한다. Vercel 서버 렌더와 Better Stack 모니터가 해외에서 올 수 있다.
- WAF 규칙은 프록시가 켜져 있을 때만 적용된다.

### 1-5. (하루 이상 가면) 저장소 핫픽스

- 1-1 은 서버 파일만 바꿨다. 다음 main 배포가 저장소 파일로 덮어쓰면 신뢰 블록이 사라져 #1112 회귀가 난다.
- develop 에 신뢰 블록을 되살리는 PR 을 낸다. 신뢰 블록을 지운 커밋(#1395 의 squash 커밋)을 `git revert` 하면 Caddyfile 신뢰 블록과 `deploy-config-ci.yml` 의 존재 단언이 함께 돌아온다. 머지 뒤 main 으로 승격한다.
  - Cloudflare 대역이 #1112 때와 달라졌으면 revert 뒤 최신 대역으로 맞춘다.
- 그 전까지 main 배포를 돌리지 않는다.

### 1-6. (최후) 고정 IP 교체

공격자가 서버 IP 를 직접 때려 대역폭이 찰 때 쓴다. 방화벽은 연결은 막아도, IP 로 쏟아지는 대량 패킷 자체는 막지 못한다.

1. Lightsail → **네트워킹** → 고정 IP 를 새로 만든다.
2. 기존 고정 IP 를 인스턴스에서 분리하고, 새 고정 IP 를 인스턴스에 연결한다.
3. Cloudflare `api` 레코드 값을 새 IP 로 바꾼다(프록시 켠 채로).
4. 옛 고정 IP 는 바로 해제한다. 인스턴스에 붙어 있지 않은 고정 IP 는 과금될 수 있다.
5. 저장소 시크릿 `LIGHTSAIL_HOST` 가 IP 면 새 IP 로 바꾼다. 배포 CD 와 운영 SSH 가 쓴다.
6. 방화벽 규칙(1-3)은 인스턴스에 붙어 있으니 교체 뒤에도 그대로인지 확인한다.

새 IP 는 1-3 잠금이 유지되는 한 Cloudflare 밖에서 api 인증서를 보여 주지 않아 다시 찾기 어렵다. 평상시(직결)로 돌아가면 다시 드러난다.

### 1-7. (며칠 이상 유지할 때) 원본 인증(AOP) — 아직 준비 안 됨

- 1-3 방화벽은 "우리 존" 이 아니라 **Cloudflare 고객 전체**를 허용한다. 공격자가 자기 Cloudflare 존을 우리 서버로 겨누면 방화벽을 통과하고 `Cf-Connecting-Ip` 를 마음대로 정할 수 있다. 그러면 IP 기준 레이트리밋이 우회된다(#1329).
- 닫는 방법: **존 전용 인증서**로 Authenticated Origin Pulls 를 켜고, Caddy 가 그 인증서가 없는 연결을 거절하게 한다.
  - Caddy 쪽은 Caddyfile `tls { client_auth { … } }` 설정과 인증서 파일 마운트가 필요하다.
  - Cloudflare 공용 인증서는 모든 고객이 같이 쓰므로 소용없다.
- **현재 준비돼 있지 않다.** 인증서 생성·Cloudflare 등록·Caddy 설정·compose 마운트를 미리 만들어 리허설해 두는 게 후속 과제다. 비상 모드가 며칠 이상 가면 이것부터 한다.
- SSL/TLS 암호화 모드는 **전체(엄격)** 로 올릴 수 있다. 원본 인증서(Let's Encrypt, Caddy 자동 갱신)가 정상이기 때문이다. 다만 존 전체 설정이라 `duings.com`·`files` 에도 함께 적용된다.

## 2. 평상시(직결)로 되돌리기

공격이 끝나고 충분히 안정되면(예: 24시간 이상 정상) 아래 순서로 되돌린다.

1. **Lightsail 방화벽 다시 열기**
   - IPv4 80·443 의 "IP 주소로 제한" 을 풀어 전체 허용으로 한다.
   - IPv6 80 규칙을 되살린다.
   - 확인: 1-3 의 `--resolve` 직결 curl 이 `200`.
2. **Cloudflare `api` 레코드 프록시 끄기**(DNS 전용) → TTL 2분. 1-4 의 WAF 규칙은 프록시를 끄면 효력이 없으니 지운다.
3. **TTL 이 지나 `dig` 가 서버 IP 를 돌려준 뒤** 서버 Caddy 에서 신뢰 블록을 지운다.

   ```bash
   cd /home/ubuntu/duing
   cp Caddyfile Caddyfile.before-revert
   grep -vE '^[[:space:]]+(trusted_proxies static |client_ip_headers Cf-Connecting-Ip$)' Caddyfile > /tmp/Caddyfile.direct
   docker run --rm -i caddy:2-alpine caddy validate --config - --adapter caddyfile < /tmp/Caddyfile.direct
   cp /tmp/Caddyfile.direct Caddyfile
   docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   docker compose exec -T caddy curl -s localhost:2019/config/apps/http/servers | grep -o '"client_ip_headers"' || echo "신뢰 블록 없음 — 정상"
   ```

4. **저장소**: 1-5 핫픽스를 했다면 그 revert 를 다시 되돌리는 PR(신뢰 블록 제거 + 부재 단언)을 머지하고 main 으로 승격한다. 핫픽스를 하지 않았다면 3번 결과가 이미 저장소 파일과 같다.
5. **사후 기록**: 타임라인(감지 → 전환 → 복구), 공격 형태, 다음에 바꿀 점을 남긴다. `UPTIME.md` 런북 5번과 같은 방식이다.

## 3. 확인 명령 모음

| 확인 | 명령 | 기대 |
|---|---|---|
| 지금 DNS | `dig +short api.duings.com` | 직결: 서버 IP / 비상 모드: Cloudflare IP |
| Cloudflare 경유 여부 | `curl -s -D - -o /dev/null https://api.duings.com/actuator/health \| grep -i cf-ray` | 비상 모드면 값 있음, 직결이면 없음 |
| Caddy 구동 설정 | (서버) `docker compose exec -T caddy curl -s localhost:2019/config/apps/http/servers` | 신뢰 블록 유무, 시간 상한(`read_header_timeout: 10000000000` 등) |
| 원본 직접 접속 | `curl -s -o /dev/null -w '%{http_code}\n' --max-time 5 --resolve api.duings.com:443:<서버 IP> https://api.duings.com/actuator/health` | 잠금 중 `000`, 평시 `200` |
| 서버 부하 | (서버) `docker stats --no-stream`, `ss -s` | — |

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
