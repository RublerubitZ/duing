# Du-ing Frontend (TBD)

프론트엔드 스캐폴딩 예정. 본 디렉터리는 placeholder.

## 결정 필요 사항

| 항목 | 후보 | 비고 |
|---|---|---|
| 프레임워크 | React (Vite) / Next.js / Remix | SSR 필요 여부 · SEO 요구로 결정 |
| 패키지 매니저 | pnpm / npm | 권장: pnpm |
| 스타일 | Tailwind CSS / shadcn-ui / CSS Modules | — |
| 상태관리 | Zustand / TanStack Query (서버 상태) | 서버 상태는 TanStack Query 권장 |
| API 클라이언트 | OpenAPI codegen → 자동 생성 TS 클라이언트 | `backend` 의 `/v3/api-docs` 기반 |
| 폼 | React Hook Form + Zod | — |
| 테스트 | Vitest (단위) + Playwright (E2E) | — |
| 인증 | JWT 헤더 (localStorage 또는 httpOnly cookie) | XSS 고려해 cookie 선호 |

## 예상 디렉터리 (Vite + React 가정)

```
frontend/
├── public/
├── src/
│   ├── api/          # OpenAPI 자동 생성 클라이언트 + 래퍼
│   ├── components/   # 공용 UI
│   ├── features/     # 도메인별 화면(user, club, recruitment, application)
│   ├── hooks/
│   ├── pages/        # 라우트
│   ├── stores/
│   └── styles/
├── index.html
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── vite.config.ts
```

## API 베이스 URL

로컬 백엔드: `http://localhost:8080/api/v1`
환경변수로 주입 (`VITE_API_BASE_URL` 또는 `NEXT_PUBLIC_API_BASE_URL`).

## 첫 PR 체크리스트 (스캐폴딩 시)

- [ ] 패키지 매니저 결정 + `pnpm-lock.yaml` 커밋
- [ ] ESLint + Prettier 설정 (백엔드 컨벤션과 톤 맞추기 — 한국어 메시지는 유지)
- [ ] `.env.example` 생성 (`VITE_API_BASE_URL` 등)
- [ ] `frontend/.gitignore` (node_modules, dist, .env.local 등)
- [ ] GitHub Actions `paths: ['frontend/**']` 워크플로우 추가
- [ ] OpenAPI 코드 생성 스크립트 (`pnpm gen:api`)
