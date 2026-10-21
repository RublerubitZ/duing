# 배포 (백엔드 — AWS Lightsail + Docker + Caddy)

두잉 백엔드를 Lightsail VM 한 대에서 Docker 로 운영한다. Caddy 가 `api.duings.com` 의 TLS 종단과
리버스 프록시를 맡고, 백엔드 컨테이너는 내부 네트워크에서만 8080 을 노출한다.
프론트(Vercel)·DB(Supabase prod)·스토리지(R2)·메일(Resend 주 발송 + Brevo SMTP 폴백)은 외부 매니지드 서비스다.
외부 가용성 감시·장애 알림·대응 런북은 [`UPTIME.md`](./UPTIME.md), DB 백업·복원(RTO/RPO 포함)은 [`DB-RESTORE.md`](./DB-RESTORE.md),
공격·트래픽 폭증 때 Cloudflare 프록시를 다시 켜는 비상 모드와 되돌리기는 [`EDGE-EMERGENCY.md`](./EDGE-EMERGENCY.md) 참조.

## 사전 준비 (1회)

1. **Lightsail 인스턴스** 생성 + **고정 IP** 할당, Docker / docker-compose 설치.
2. **방화벽**: 22(SSH), 80, 443 인바운드만 개방(8080 은 호스트로 열지 않는다 — Caddy 경유).
3. **DNS**: `api.duings.com` A 레코드를 인스턴스 고정 IP 로 지정. Vercel Firewall 규칙 `내부 재검증 — 백엔드 서버 외 차단 (#1364)` 의 IP 조건도 이 IP 로 맞춘다(아래 Vercel 문단 참고).
4. **Resend**: `duings.com` 발신 도메인 검증(SPF/DKIM).
   **Brevo(폴백)**: 동일 발신 도메인을 Brevo 에서도 발신자 인증(SPF/DKIM)하고, SMTP 키를 발급해
   `.env` 의 `BREVO_SMTP_LOGIN`/`BREVO_SMTP_KEY` 로 주입한다(미주입 시 폴백만 비활성, 발송은 Resend 단독).
5. **GHCR (Private 패키지)**: CD 가 이미지를 push·pull 하도록 설정한다(deploy 워크플로가 GITHUB_TOKEN 으로 처리).
   패키지가 **Private** 이므로 서버에서 *수동* pull 을 하려면 먼저 classic PAT 로 로그인해야 한다:
   ```bash
   echo <PAT> | docker login ghcr.io -u <github-user> --password-stdin
   ```
   - **classic PAT** 사용을 권장한다(스코프는 `read:packages` 하나만). fine-grained PAT 는 패키지 권한 매핑이 까다로워 비권장.
   - **CD 가 SSH 로 접속하는 동일 계정**(LIGHTSAIL_USER, 기본 `ubuntu`)으로 로그인한다(`~/.docker/config.json` 은 계정별).
   - CD 자동 배포는 이 PAT 없이도 동작한다(GITHUB_TOKEN 으로 매 배포 격리 로그인). PAT 는 수동 운영·복원력용이다.

## 서버 배치

서버에 배포 디렉터리를 만들고, 이 저장소의 `deploy/docker-compose.yml`·`deploy/Caddyfile` 과
`backend/.env.example` 를 올린다. 같은 디렉터리에서 예시를 복사해 `.env` 를 만들고 운영 값으로 채운다.

```bash
cp .env.example .env   # backend 에서 가져온 .env.example 복사 → DB/JWT/R2/Resend/SENTRY_DSN 등 채움
```

`.env` 핵심값:
- `CORS_ALLOWED_ORIGINS=https://duings.com,https://www.duings.com`
- `JWT_SECRET=...`(Access Token 서명용, 최소 32바이트)
- `JWT_EXPIRY_MS` 는 어떤 값이든 넣지 않는다 — #1347 부터 Access JWT 수명은 코드 상수 30분이라 앱이 읽지 않는다. 그러나 #1347 이전 이미지는 이 값을 읽으므로(빈 값은 물론, 30분 값도 이미지에 따라 실패), 줄이 남아 있으면 그 이미지로의 롤백(같은 `.env` 를 쓰는 자동 롤백 포함)이 기동에 실패할 수 있다. 남아 있으면 **줄째 지운다**
- `AUTH_HINT_SECRET=...`(웹 Middleware UX 힌트 서명용, 최소 32바이트이며 `JWT_SECRET`과 다른 값)
- `AUTH_HINT_COOKIE_DOMAIN=.duings.com`(`.env.example` 는 빈 값이니 새 서버에도 이 값을 넣는다) — #1350 부터 운영 힌트 Cookie Domain 은 코드 상수라 앱이 이 값을 쓰지 않는다. 그러나 #1350 이전 이미지는 이 값을 기본값 없이 읽고 정확히 `.duings.com` 인지 검사하므로, 줄이 없거나 값이 다르면 그 이미지로의 롤백(같은 `.env` 를 쓰는 자동 롤백 포함)이 기동에 실패한다. **지우거나 바꾸지 않는다**
- `SENTRY_DSN=...`(운영 필수 — 빈 값이면 Sentry 비활성)
- `DUING_FRONTEND_REVALIDATE_SECRET=...`(동아리 탐색 정각·상세 변경 시·매일 00:05 재생성 트리거, 32바이트 이상 — Vercel `REVALIDATE_SECRET` 과 같은 값. 비우면 트리거만 꺼지고 부팅은 정상)
- `DB_POOL_MAX_SIZE=10`(**10 을 넘기지 말 것** — Supabase 세션 풀러 한도 15 에서 백업·관리도구 몫 5 를 남긴다. 15 로 올리면 04:15 백업이 실패한다, 2026-09-20 실사고)
- `BACKEND_IMAGE=ghcr.io/rublerubitz/duing-backend:<tag>`

웹 인증 시크릿 중 Vercel에는 백엔드와 동일한 `AUTH_HINT_SECRET`만 등록한다. `JWT_SECRET`은 백엔드 전용이므로 Vercel에
등록하거나 프론트 빌드 환경에 노출하면 안 된다. 실제 Access Token은 백엔드가
`__Host-duing_access_token` host-only Cookie로 발급하며 Domain을 지정하지 않고
`Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=1800`을 적용한다(Refresh Token Cookie
`__Secure-duing_refresh_token`은 `Path=/api/v1/auth`, 30일 — 로그인 상태 유지를 끄면 `auth_hint`까지
셋 다 세션 Cookie). `.duings.com` Domain을 사용하는
`auth_hint`는 Next.js Middleware의 로그인·역할별 리다이렉트 UX 전용이며 API 인증·권한 자료가 아니다.

Vercel에는 동아리 탐색(정각)·상세(변경 시·매일 00:05) 재생성 트리거용 `REVALIDATE_SECRET` 도 Production 환경변수로
등록한다. 백엔드 `.env` 의 `DUING_FRONTEND_REVALIDATE_SECRET` 과 같은 값이다(생성: `openssl rand -base64 48`). Vercel
환경변수는 다음 배포부터 반영되므로 등록 뒤 재배포한다. 이 경로는 Vercel Firewall 사용자 규칙
`내부 재검증 — 백엔드 서버 외 차단 (#1364)` 이 백엔드 서버 고정 IP 밖에서 오는 요청을 403 으로 막는다(서버 IP 를 바꾸면
이 규칙도 고친다 — EDGE-EMERGENCY.md 1-6). 그래서 확인은 **서버에서** 한다. 인증 없이
`curl -s -o /dev/null -w '%{http_code}' -X POST https://duings.com/api/internal/revalidate` 를 보내면 미설정이거나
32바이트 미만이면 503, 설정됐으면 401 이다. 다른 곳에서 보내면 403 이다. 유출이 의심되면 두 곳을 같은 새 값으로 함께 바꾸고, Vercel 재배포와 백엔드 재기동(`docker compose up -d`)으로 반영한다.

## 웹 인증 지원 환경

- 운영 `duings.com` / `api.duings.com`: 완전 지원.
- 로컬 `localhost:3000` / `localhost:8080`: 완전 지원. 두 프로세스 모두 호스트 문자열을
  `localhost`로 통일하고 `127.0.0.1`과 혼용하지 않는다. 로컬 `backend/.env`에서는
  `AUTH_HINT_COOKIE_DOMAIN`을 빈 값으로 두거나 설정하지 않아 Access Token과 `auth_hint`를 모두
  localhost host-only Cookie로 발급한다.
- 브라우저의 localhost Secure Cookie 예외로 HTTP localhost 개발을 지원한다. 일반 HTTP
  non-localhost 호스트에는 웹 인증 Cookie를 발급하지 않는다.
- 일반 `*.vercel.app` Preview: 인증 미지원. 인증 검증이 필요하면 `preview.duings.com`처럼 API와
  동일 사이트인 커스텀 도메인을 연결한다.

웹 인증은 디바이스별 세션과 Refresh Token(30일, 갱신마다 연장)을 쓴다. 로그아웃과 개별 세션 폐기는 그
세션만 끊는다 — 그 기기에서 이미 발급된 Access Token은 만료(최대 30분)까지 서버에서 유효하다. 모든 기기를
즉시 끊는 경로는 사용자의 모든 기기 로그아웃(`DELETE /api/v1/users/me/sessions`)과
비밀번호 변경·재설정·전화번호 변경·탈퇴, 관리자의 강제 로그아웃·계정 정지다. 이 경로들은 `token_version`을
올려 발급된 Access Token을 즉시 무효화하고, 모든 세션·Refresh Token도 함께 폐기한다 — `token_version`만
올리면 다음 갱신에서 새 Access Token이 발급된다.
로그아웃한 기기의 Access Token이 만료까지 유효한 이 30분 창은 매 요청 세션 조회를 피하려고 수용한 절충이다(#1321 L-2). 탈취가 의심되면 사용자에게
'모든 기기에서 로그아웃'이나 비밀번호 변경을 안내한다.

## 웹 인증 배포 순서

> 2026-07 웹 Cookie 전환 때의 1회성 절차다(당시 Access Token 수명은 1시간이었다).

1. 백엔드를 먼저 배포한다. 새 백엔드는 기존 모바일·이전 웹의 Bearer 인증과 새 웹 Cookie 인증을 함께
   지원한다.
2. 백엔드에 `JWT_SECRET`, `AUTH_HINT_SECRET`, `AUTH_HINT_COOKIE_DOMAIN=.duings.com`이 주입됐고 두
   Secret이 서로 다른지 확인한다.
3. Vercel에는 동일한 `AUTH_HINT_SECRET`만 주입하고 `JWT_SECRET`이 없음을 확인한다.
4. 프론트를 두 번째로 배포해 웹 API 클라이언트를 Cookie 모드로 전환한다.
5. 로그인, 새로고침, 권한 경로, 1시간 만료, 로그아웃을 운영과 같은 두 도메인에서 smoke test한다.

DB 마이그레이션은 없다. 새 프론트는 시작할 때 기존 `duing.accessToken` 저장소와 `duing_token` Cookie만
멱등 정리하며, 이미 발급된 Bearer JWT는 최대 1시간 뒤 자연 만료된다.

문제가 생기면 Bearer+Cookie 호환 계층인 새 백엔드는 유지하고 프론트만 이전 버전으로 롤백한다. 이전
프론트는 기존 `/auth/login` Bearer 경로를 계속 사용할 수 있다. 새 프론트가 `/auth/web/login`과 Cookie
인증에 의존하므로 프론트보다 백엔드를 먼저 이전 버전으로 롤백하면 안 된다.

## 실행 / 업데이트

> Private 패키지이므로 아래 `pull` 전에 위 5번의 `docker login ghcr.io`(classic PAT)가 선행돼야 한다.
> 한 번 로그인하면 토큰 만료 전까지 재부팅 후에도 유지된다. `unauthorized` 가 나면 PAT 로 재로그인한다.

```bash
docker compose pull        # GHCR 에서 최신 이미지 받기 (Private — 사전 docker login 필요)
docker compose up -d       # 기동(또는 갱신). Caddy 가 최초 기동 시 TLS 인증서 자동 발급
docker compose logs -f backend
```

DB 마이그레이션(Flyway)은 백엔드 부팅 시 자동 적용된다. 롤백은 이전 이미지 태그로 `BACKEND_IMAGE` 를
되돌린 뒤 `docker compose up -d` 한다. #1347 이전 이미지로 되돌릴 때는 먼저 `.env` 에 `JWT_EXPIRY_MS` 줄이
없는지, #1350 이전 이미지로 되돌릴 때는 `AUTH_HINT_COOKIE_DOMAIN=.duings.com` 줄이 그대로 있는지 확인한다
(위 `.env` 핵심값 참고).

### 로고 썸네일 롤백 뒤 정리 (V133 이후 이미지에서 이전 이미지로 되돌렸다가 다시 올릴 때)

배포 워크플로가 헬스 실패로 직전 이미지에 자동 롤백한 경우도 같다 — 그 뒤 다시 배포하기 전에 아래를 그대로 따른다(대상이 없으면 0건으로
끝난다). 직전 이미지가 V133 이전일 때만 해당한다 — V133 이후 이미지끼리 되돌렸다면 돌려도 썸네일을 한 번 더 만들 뿐이다.

이전 이미지는 `club.logo_thumbnail_url` 을 모르므로, 롤백 기간에 로고를 바꾼 동아리는 옛 로고의 썸네일이 새 로고 옆에 그대로
남는다. 백필은 썸네일이 비어 있는 동아리만 집고 **기동 때 한 번만** 돌므로, 새 이미지를 다시 기동하기 **전에** 아래 SQL 을
실행한다(이미 기동했으면 실행한 뒤 백엔드를 한 번 더 재기동한다). `<롤백 시각>` 은 이전 이미지 컨테이너의 기동 시각(UTC,
`docker compose logs backend` 의 `Started DuingApplication` 줄)이다 — `club.updated_at` 은 naive `TIMESTAMP` 에 JVM `TZ=UTC`
벽시계로 기록되므로 로그 시각(`2026-10-20T13:05:00.123Z` 꼴)을 그대로 넣는다(naive 열과 비교하는 문자열의 `Z` 는 무시돼 세션
TimeZone 과 상관없이 UTC 벽시계로 비교된다). 끝 시각은 두지 않는다 — 재배포 뒤에 다시 수정된 동아리도 대상에 들지만 썸네일을 한 번
더 만들 뿐이다. 1) 을 먼저 — 비우기만 하면 썸네일의 추적 행이 ACTIVE 고아로 남아 파기 잡이 지우지 않는다. 1)·2) 의 대상 조건(살아
있고 썸네일이 있고 롤백 시각 뒤에 수정된 동아리)은 같다. 3) 은 시각 조건이 없다 — 이전 이미지의 폐쇄는 썸네일을 해제하지 않고 새
이미지의 폐쇄는 늘 해제하므로, 폐쇄된 동아리의 썸네일 추적 행이 ACTIVE 로 남아 있으면 롤백 기간의 폐쇄다.

```sql
-- 1) 비울 썸네일의 추적 행을 RELEASED 로 내린다. 원본 URL 을 그대로 쓴 썸네일(따로 추적 행이 없다)만 뺀다 —
--    IS DISTINCT FROM 이라 옛 코드로 로고를 비운(logo_url IS NULL) 동아리도 빠지지 않는다(<> 는 NULL 로 평가돼 건너뛴다).
UPDATE uploaded_object SET status = 'RELEASED', released_at = NOW()
 WHERE status = 'ACTIVE' AND purpose = 'LOGO'
   AND storage_key IN (SELECT substring(logo_thumbnail_url from '[^/]+/[^/]+/[^/]+$') FROM club
                        WHERE deleted_at IS NULL AND logo_thumbnail_url IS NOT NULL
                          AND updated_at >= '<롤백 시각>'
                          AND logo_thumbnail_url IS DISTINCT FROM logo_url);
-- 2) 같은 동아리의 썸네일을 비운다 — 재기동 뒤 백필이 다시 만든다(시작 로그 `[로고 썸네일 백필] 시작 — 대상 N` 에서 N 이 비운 건수 이상인지 본다).
UPDATE club SET logo_thumbnail_url = NULL
 WHERE deleted_at IS NULL AND logo_thumbnail_url IS NOT NULL
   AND updated_at >= '<롤백 시각>';
-- 3) 롤백 기간에 폐쇄된 동아리의 썸네일 추적 행을 RELEASED 로 내린다(원본 URL 을 그대로 쓴 썸네일은 폐쇄의 로고 해제가 다뤘다).
UPDATE uploaded_object SET status = 'RELEASED', released_at = NOW()
 WHERE status = 'ACTIVE' AND purpose = 'LOGO'
   AND storage_key IN (SELECT substring(logo_thumbnail_url from '[^/]+/[^/]+/[^/]+$') FROM club
                        WHERE deleted_at IS NOT NULL AND logo_thumbnail_url IS NOT NULL
                          AND logo_thumbnail_url IS DISTINCT FROM logo_url);
```

### 기간 종료 자동 마감 되돌리기 (매일 00:40 잡이 잘못 닫은 모집을 다시 열 때)

`RecruitmentAutoCloseJob` 이 닫은 모집을 OPEN 으로 되돌린다. 아래 순서를 그대로 따른다 — 컨테이너를 다시 만들면(2) 의 `up -d`)
그 전 로그가 사라지고, 플래그를 끄지 않고 되돌리면 다음 00:40 에 같은 모집이 다시 닫힌다.

1) 대상 확보 — DB 에서 그날 잡이 닫은 모집을 뽑는다. `recruitment.closed_at` 은 seoul 벽시계(TIMEZONE.md)라 KST 날짜·시각을
그대로 넣는다. 같은 1분 안에 손으로 닫은 모집이 섞일 수 있으니, 컨테이너를 다시 만들기 **전에** 잡 로그의 id 목록도 떠 두고 대조한다
(로그 시각은 JVM `TZ=UTC` 라 KST 00:40 이 전날 15:40 으로 찍힌다).

```sql
SELECT id, club_id FROM recruitment
 WHERE status = 'CLOSED' AND deleted_at IS NULL
   AND closed_at >= '<날짜> 00:40' AND closed_at < '<날짜> 00:41';
```

```bash
docker compose logs backend | grep 'closed ids'   # RecruitmentAutoCloseJob closed ids=[…]
```

운영진이 열어 두길 원하는 모집이 한두 건뿐이면 1)·3)·4) 로 되돌린 뒤 그 운영진에게 종료일을 연장하게 하는 것으로 충분하다
(플래그는 그대로 둔다 — 종료일이 연장되면 다음 00:40 에 다시 닫히지 않는다). 다음 00:40 전에 연장되지 않으면 또 닫힌다.

2) 플래그 끄기 — 잡 자체가 잘못 닫았을 때. `deploy/.env` 에 `DUING_RECRUITMENT_AUTO_CLOSE_ENABLED=false` 를 넣고
`docker compose up -d` 로 반영한다(컨테이너를 다시 만들어 수십 초 동안 API 가 끊긴다). 원인을 고친 이미지를 배포한 뒤 줄을 지워
다시 켠다. 되돌린 모집이 여전히 조건을 만족하면 다시 켠 다음 00:40 에 또 닫히므로, 다시 켜기 전에 운영진이 종료일을 연장하게 한다.
플래그를 오래 끄거나 백엔드만 롤백하면 운영진 화면의 기간 종료 안내(자동 마감 문장)가 사실과 달라지므로, 그때는 프론트 안내 문구도 되돌린다.

3) 되돌리기 SQL — `<id 목록>` 에 1) 의 id 를 넣는다. 동아리당 OPEN 모집은 1건만 허용되므로(V38 `uk_recruitment_club_active`)
그 사이 같은 동아리에 새 모집이 열렸으면 건너뛰고, 그 사이 삭제된 모집은 되살리지 않는다. 바뀐 건수가 1) 보다 적으면 빠진 id 를 확인한다.

```sql
UPDATE recruitment SET status = 'OPEN', closed_at = NULL
 WHERE id IN (<id 목록>) AND status = 'CLOSED' AND deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM recruitment o
                    WHERE o.club_id = recruitment.club_id AND o.status = 'OPEN' AND o.deleted_at IS NULL);
```

4) 공개 상세 재검증 — SQL 은 상세 재생성 트리거를 부르지 않으므로 되돌린 동아리의 상세(`/clubs/<club_id>`, 7일 캐시)를 직접 다시
만든다(탐색 목록 `/clubs` 는 정각 재생성이 반영한다). 이 경로는 서버 고정 IP 밖에서 403 이라(위 Vercel `REVALIDATE_SECRET` 설명)
**서버에서** `deploy/` 디렉터리에서 보낸다. `paths` 는 한 번에 10개까지이고, 200 이면 성공이다(401·502 등은 MONITORING.md
`런북 — 프론트 재생성 트리거 연속 실패` 의 사유 표).

```bash
DUING_FRONTEND_REVALIDATE_SECRET=$(sed -n 's/^DUING_FRONTEND_REVALIDATE_SECRET=//p' .env)
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://duings.com/api/internal/revalidate \
  -H "Authorization: Bearer $DUING_FRONTEND_REVALIDATE_SECRET" -H 'Content-Type: application/json' \
  -d '{"paths":["/clubs/<club_id>"]}'
```
