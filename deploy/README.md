# 배포 (백엔드 — AWS Lightsail + Docker + Caddy)

두잉 백엔드를 Lightsail VM 한 대에서 Docker 로 운영한다. Caddy 가 `api.duings.com` 의 TLS 종단과
리버스 프록시를 맡고, 백엔드 컨테이너는 내부 네트워크에서만 8080 을 노출한다.
프론트(Vercel)·DB(Supabase prod)·스토리지(R2)·메일(Resend)은 외부 매니지드 서비스다.

## 사전 준비 (1회)

1. **Lightsail 인스턴스** 생성 + **고정 IP** 할당, Docker / docker-compose 설치.
2. **방화벽**: 22(SSH), 80, 443 인바운드만 개방(8080 은 호스트로 열지 않는다 — Caddy 경유).
3. **DNS**: `api.duings.com` A 레코드를 인스턴스 고정 IP 로 지정.
4. **Resend**: `duings.com` 발신 도메인 검증(SPF/DKIM).
5. **GHCR**: CD 가 이미지를 push 하도록 설정한다([PR 3 / deploy 워크플로]). 패키지가 private 면 서버에서
   `echo <PAT> | docker login ghcr.io -u <user> --password-stdin` 로 먼저 로그인해야 `docker compose pull` 이 동작한다(public 이면 불필요).

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

```bash
docker compose pull        # GHCR 에서 최신 이미지 받기
docker compose up -d       # 기동(또는 갱신). Caddy 가 최초 기동 시 TLS 인증서 자동 발급
docker compose logs -f backend
```

DB 마이그레이션(Flyway)은 백엔드 부팅 시 자동 적용된다. 롤백은 이전 이미지 태그로 `BACKEND_IMAGE` 를
되돌린 뒤 `docker compose up -d` 한다.
