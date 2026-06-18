# 배포 (백엔드 — AWS Lightsail + Docker + Caddy)

두잉 백엔드를 Lightsail VM 한 대에서 Docker 로 운영한다. Caddy 가 `api.duings.com` 의 TLS 종단과
리버스 프록시를 맡고, 백엔드 컨테이너는 내부 네트워크에서만 8080 을 노출한다.
프론트(Vercel)·DB(Supabase prod)·스토리지(R2)·메일(Resend)은 외부 매니지드 서비스다.

## 사전 준비 (1회)

1. **Lightsail 인스턴스** 생성 + **고정 IP** 할당, Docker / docker-compose 설치.
2. **방화벽**: 22(SSH), 80, 443 인바운드만 개방(8080 은 호스트로 열지 않는다 — Caddy 경유).
3. **DNS**: `api.duings.com` A 레코드를 인스턴스 고정 IP 로 지정.
4. **Resend**: `duings.com` 발신 도메인 검증(SPF/DKIM).
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
- `SENTRY_DSN=...`(운영 필수 — 빈 값이면 Sentry 비활성)
- `BACKEND_IMAGE=ghcr.io/rublerubitz/duing-backend:<tag>`

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
