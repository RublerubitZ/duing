# 배포 (백엔드 — AWS Lightsail + Docker + Caddy)

두잉 백엔드를 Lightsail VM 한 대에서 Docker 로 운영한다. Caddy 가 `api.duings.com` 의 TLS 종단과
리버스 프록시를 맡고, 백엔드 컨테이너는 내부 네트워크에서만 8080 을 노출한다.
프론트(Vercel)·DB(Supabase prod)·스토리지(R2)·메일(Resend 주 발송 + Brevo SMTP 폴백)은 외부 매니지드 서비스다.
외부 가용성 감시·장애 알림·대응 런북은 [`UPTIME.md`](./UPTIME.md) 참조.

## 사전 준비 (1회)

1. **Lightsail 인스턴스** 생성 + **고정 IP** 할당, Docker / docker-compose 설치.
2. **방화벽**: 22(SSH), 80, 443 인바운드만 개방(8080 은 호스트로 열지 않는다 — Caddy 경유).
3. **DNS**: `api.duings.com` A 레코드를 인스턴스 고정 IP 로 지정.
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
- `JWT_EXPIRY_MS=3600000`(Access JWT/Cookie/auth_hint의 고정 1시간 계약, 다른 값은 기동 실패)
- `AUTH_HINT_SECRET=...`(웹 Middleware UX 힌트 서명용, 최소 32바이트이며 `JWT_SECRET`과 다른 값)
- `AUTH_HINT_COOKIE_DOMAIN=.duings.com`(운영에서 누락하거나 다른 값을 쓰면 기동 실패)
- `SENTRY_DSN=...`(운영 필수 — 빈 값이면 Sentry 비활성)
- `BACKEND_IMAGE=ghcr.io/rublerubitz/duing-backend:<tag>`

Vercel에는 백엔드와 동일한 `AUTH_HINT_SECRET`만 등록한다. `JWT_SECRET`은 백엔드 전용이므로 Vercel에
등록하거나 프론트 빌드 환경에 노출하면 안 된다. 실제 Access Token은 백엔드가
`__Host-duing_access_token` host-only Cookie로 발급하며 Domain을 지정하지 않고
`Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`을 적용한다. `.duings.com` Domain을 사용하는
`auth_hint`는 Next.js Middleware의 로그인·역할별 리다이렉트 UX 전용이며 API 인증·권한 자료가 아니다.

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

현재 웹 인증에는 Refresh Token이나 디바이스별 세션이 없다. 로그아웃은 사용자 단위 `token_version`을
증가시키므로 웹 또는 모바일 한 곳에서 로그아웃하면 기존 웹 Cookie와 모든 모바일 Bearer Token이 함께
무효화된다.

## 웹 인증 배포 순서

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
되돌린 뒤 `docker compose up -d` 한다.
