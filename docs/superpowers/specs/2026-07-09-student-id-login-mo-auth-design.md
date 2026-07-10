# 학번 로그인 + 휴대폰 MO 인증 전환 설계서 (v2)

- 작성일: 2026-07-09 (v2 — 공식 샘플 코드 기반 Octomo 계약 확정 및 전면 개정 / v2.1 — 코드 미저장 파생 방식·Redis 전환 계획 반영)
- 대상 도메인: User / Auth (+ Application 지원자 노출, Admin 회원 검색)
- 대체 대상: 이메일 회원가입 인증(2026-06-13-email-verification-design.md) · 이메일 로그인
- 관련 요구사항: REQUIREMENTS.md §2.1 (U-1·U-2·U-3 전면 개정 필요)
- 참고: [octomo-sample-code](https://github.com/Octoverse-corp-official/octomo-sample-code) (공식 샘플, 계약의 1차 근거)

## 1. 배경 및 목적

현재 회원가입은 `@daegu.ac.kr` 이메일 인증(코드 발송 → 입력 → 확인)을 거치고, 로그인 식별자도 이메일이다. 본 변경으로:

- **로그인 ID를 이메일 → 학번(8자리 숫자)** 으로 교체한다.
- **가입 시 진위 확인을 이메일 소유 → 휴대폰 소유(Octomo MO 인증)** 로 교체한다.
- **이메일 필드를 시스템에서 완전 제거**한다 (가입 폼·내 정보·지원자 연락처·관리자 검색 전부).
- MO 인증 세션을 **범용화(purpose)** 해 3가지 용도로 쓴다: **회원가입 / 전화번호 변경 / 비밀번호 재설정**.
- 학번 진위는 별도 검증하지 않는다 (자기신고 + 학번 유니크 제약으로 중복가입만 방지).

MO(Mobile Originated)는 사용자가 자기 휴대폰으로 Octomo 대표번호(**1666-3538**)에 인증코드 문자를 직접 보내는 방식이다. 발신 자체가 실기기 소유 증명이고, 우리 쪽 발송 비용이 없다.

## 2. Octomo API 계약 (공식 샘플 코드로 확정)

v1 설계는 "서비스명 스코프 수신 문자 **목록 조회**" API를 가정했으나, 공식 샘플(`octomo_sample_server/src/services/octomo.client.ts`) 확인 결과 실제 계약은 다음과 같다. **v1의 목록 기반 매칭 설계는 전부 폐기**한다.

### 2.1 Message Exists — 인증 확인

```
POST https://api.octoverse.kr/octomo/v1/public/message/exists
Authorization: Octomo {API_KEY}
Content-Type: application/json

{ "mobileNum": "01012345678", "text": "7K3M9PXQ", "withinMinutes": 5 }
→ { "exists": true | false }
```

- **(발신번호, 본문) 쌍의 존재 여부만** 반환한다. 수신 문자 목록·발신번호를 되돌려주지 않는다.
- 함의 ①: **사용자의 휴대폰 번호를 우리가 먼저 알아야 한다.** "번호 입력 자체를 없애는" 설계는 이 API로는 불가능하다. 대신 **회원가입 폼의 독립된 전화번호 입력란은 제거**하고, 번호 입력을 **인증 스텝 안으로** 옮긴다 — 인증을 통과한 번호만 서버가 세션에서 꺼내 저장하므로 "MO 인증으로 검증된 번호만 사용" 요구는 충족된다.
- 함의 ②: 발신번호 대조를 Octomo가 대신 해주는 셈이다. 제3자가 코드를 알아내 다른 번호로 문자를 보내도 `exists(선언번호, 코드)`는 false — v1에서 우리가 직접 하던 발신자 매칭·mismatch 감지 로직이 **통째로 불필요**해진다.
- 함의 ③: exists 질의 시점에 코드 **평문**이 필요하다. 다만 저장까지 평문일 필요는 없다 — 코드를 세션 토큰에서 **파생(derive)** 해 DB 저장 자체를 없앤다 (§5.2).
- 인증 헤더는 `Authorization: Octomo {API_KEY}` 단순 키 방식 (v1에서 언급한 HMAC-SHA512 서명은 이 두 엔드포인트에는 해당 없음 — 가입 후 문서에서 최종 확인).

### 2.2 QR Code — SMS 딥링크 QR 발급

```
POST https://api.octoverse.kr/octomo/v1/public/message/qr-code
Authorization: Octomo {API_KEY}

{ "text": "7K3M9PXQ", "errorCorrectionLevel": "M", "margin": 2, "width": 200 }
→ { "qrCode": "data:image/png;base64,..." }
```

- Octomo가 `SMSTO:{대표번호}:{text}` 딥링크를 QR(PNG data URL)로 만들어 준다. 휴대폰 기본 카메라로 스캔하면 수신번호·본문이 채워진 문자 앱이 열린다 (iOS·Android 공통 — `SMSTO:`는 QR 표준).
- 수신 대표번호를 Octomo가 관리하므로 자체 QR 생성 대비 번호 변경에 안전하다. PC 세션당 1콜이라 쿼터 부담 없음 → 자체 생성(zxing/qrcode 라이브러리)은 채택하지 않는다. QR API 실패 시에는 코드 텍스트 + 수동 발송 안내로 폴백한다.
- **캐싱 불필요**: 세션당 1회 발급하고 세션 상태(FE state)에 보관한다. 재렌더마다 재호출하지 않는다.

### 2.3 요금·한도

Free 월 10,000콜 / Pro 월 9,900원 100,000콜 / Enterprise 협의. exists 폴링이 콜의 대부분을 차지한다 (§6 예산).

## 3. Octomo 호출 주체 — Backend 확정

Frontend가 Octomo를 직접 호출하는 안은 **기각**한다. 모든 Octomo 호출은 Spring Boot 백엔드가 수행한다.

1. **API Key 노출**: FE 호출은 키를 브라우저에 노출한다. 키가 있으면 누구나 우리 계정으로 `exists`를 무제한 질의(쿼터 소진·타인 인증 여부 탐색)할 수 있다.
2. **판정의 신뢰 경계**: "인증됨" 판정이 서버 밖에서 이루어지면 위조 가능하다. signup이 어차피 서버에서 재검증해야 하므로 FE 호출은 검증을 이중으로 만들 뿐이다.
3. **레이트리밋·쿼터 통제, 벤더 교체 격리**도 서버에서만 가능하다.

공식 샘플도 동일 구조다 (Next.js FE → 자체 Node 서버 → Octomo. FE 코드 주석: "자기 서버의 /api/qr만 호출 → 옥토모를 직접 부르지 않음").

## 4. 플랫폼별 인증 UX

### 4.1 모바일 — SMS 딥링크 조사 결과와 채택안

`sms:` URI의 본문 프리필(`body=`) 지원은 **플랫폼·브라우저별로 보장이 없다**:

- Android(Chrome·Samsung Internet 등 Chromium 계열): `sms:16663538?body=인코딩본문` — 기본 문자 앱으로 정상 동작하는 것이 일반적
- iOS Safari: 역사적으로 `sms:16663538&body=...`(비표준 `&`)가 동작해 왔고 현재도 실무에서 널리 쓰이나, Apple 공식 문서는 본문 파라미터를 보장하지 않음 — 버전에 따라 무시될 수 있다
- 카카오톡 등 **인앱 브라우저**: `sms:` 스킴 자체가 차단되거나 새 창 처리되는 경우 존재
- 공식 샘플조차 모바일 딥링크를 쓰지 않고 "받는 사람·코드 표시 + 수동 발송" UX를 채택함

**채택안 — 딥링크는 점진적 개선, 수동 발송이 보장 경로**:

1. 모바일 UA 감지 시 **[문자 앱으로 보내기]** 버튼 노출 — iOS는 `sms:16663538&body=`, 그 외 `sms:16663538?body=` 생성
2. 버튼과 무관하게 **수신번호(1666-3538)·코드·[코드 복사]** 를 항상 표시 — 딥링크가 안 열리거나 본문이 비어도 사용자는 진행 가능
3. 안내 문구(샘플 준용): "메시지를 **수정 없이 그대로** 보내주세요", "요금제에 따라 문자 요금이 발생할 수 있어요"
4. 실기기 QA를 선행 작업으로: iOS Safari / iOS Chrome / Android Chrome / Samsung Internet / 카카오톡 인앱 각각에서 딥링크 body 프리필 확인 → 결과에 따라 UA 분기 조정 (조정 범위가 FE 유틸 함수 1개에 갇히도록 구현)

### 4.2 PC — QR

1. 발급 응답의 `qrCode`(data URL)를 표시 (Octomo QR API 경유, §2.2)
2. 사용자가 휴대폰 카메라로 스캔 → 문자 앱 자동 오픈(수신번호·본문 프리필) → 전송
3. QR 아래에 수신번호·코드 텍스트 병기 (스캔 실패 대비 수동 폴백)

### 4.3 공통 — 확인(폴링) 시작 트리거

발급 직후부터 폴링하면 사용자가 읽고·스캔하고·보내는 30~60초 동안 exists 콜을 낭비한다. **[문자를 보냈어요] 버튼(모바일은 딥링크 버튼 클릭도 트리거)을 누른 시점부터 3초 간격 폴링을 시작**하고, 타임아웃 5분에 도달하면 중단 후 재시도 UI를 노출한다. 문자 도달은 통상 수 초~수십 초이므로 세션당 실제 exists 콜은 2~10회 수준이 된다.

```
[번호 입력] → [인증 시작] → 코드·QR/딥링크 표시 → 사용자 문자 발송
→ [문자를 보냈어요] → 3초 폴링(최대 5분) → VERIFIED → 번호 필드 잠금·다음 단계
                                        ↘ 5분 경과 → "시간 초과" + 재발급 유도
```

## 5. 인증 세션

### 5.1 모델 — DB 테이블 (Redis 기각)

세션은 **DB 테이블**(`phone_verifications`)로 관리한다. Redis는 현 스택에 없고(단일 인스턴스 + Supabase PG), 세션 규모(동시 수십 건)에 인프라 추가는 과설계다. 다만 저장 접근을 리포지토리 인터페이스 뒤에 두어 멀티 인스턴스 전환 시 교체 가능하게 한다 — 전환 트리거·경계·경로는 §11.1에 명세.

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | Long | PK |
| `phone` | String(13) | `010-XXXX-XXXX`. **UNIQUE — 번호당 활성 세션 1개** |
| `token` | String(36) | UUID. UNIQUE — FE 폴링·제출 핸들이자 **코드 파생의 입력** (§5.2) |
| `purpose` | enum | `SIGNUP` / `PHONE_CHANGE` / `PASSWORD_RESET` |
| `targetUserId` | Long nullable | PHONE_CHANGE·PASSWORD_RESET 시 대상 회원 |
| `expiresAt` | LocalDateTime | 발급 + **5분** (Octomo `withinMinutes=5`와 정렬) |
| `verifiedAt` | LocalDateTime | null = 미인증 |
| `lastIssuedAt` | LocalDateTime | 재발급 쿨다운(60초) 기준 |

- 상태는 파생: `PENDING`(verifiedAt null && now < expiresAt) / `VERIFIED` / `EXPIRED`. **EXPIRED 우선 판정** — 단, VERIFIED 이후에는 용도별 **완료 유효시간**을 따로 적용한다(아래).
- **VERIFIED 24시간 유지는 기각**한다. 세션 토큰은 사실상 bearer 자격이라 오래 살수록 위험 창이 넓어지고, UX상 필요도 없다 — 인증 후 남은 일은 폼 마저 쓰기(수 분)다. 대신: `SIGNUP`은 인증 후 **30분**, `PHONE_CHANGE`·`PASSWORD_RESET`은 **10분** 내 완료 요구. 초과 시 재인증 (완료 API가 403 → FE가 인증 스텝으로 복귀).
- **재사용 불가**: 용도 완료(signup·변경·재설정) 시 행 삭제(consume). 만료 행은 정리 잡이 삭제(§9.4).
- 재발급: 같은 번호 재요청 시 행 upsert(토큰 재생성, verifiedAt 리셋) — 토큰이 바뀌면 파생 코드도 함께 바뀌므로 구 코드·구 토큰은 즉시 무효.

### 5.2 인증 코드 — 저장하지 않는 파생(derive) 방식

- 형식: **8자 Crockford Base32**(대문자+숫자, `I/L/O/U` 등 혼동 문자 제외) — 예: `7K3M9PXQ`. 엔트로피 40bit.
- **생성이 아니라 파생이다**: `code = Base32(HMAC-SHA256(secret, token))[0..8)`. secret은 env `PHONE_VERIFICATION_SECRET`(기본값 없음, 필수), token은 세션의 UUID(SecureRandom). 전용 컴포넌트 `PhoneVerificationCodeDeriver`가 담당하며, 발급 응답 시점과 exists 질의 직전에 각각 재계산한다.
- **DB에는 코드 컬럼이 존재하지 않는다** — "AES 등 암호화 저장" 검토의 결론이다. 보호 목표(DB 유출 시 활성 코드 비노출)를 동일하게 달성하면서, AES-GCM 저장 대비 암호문 컬럼·IV 관리·복호화 단계·키 로테이션 마이그레이션이 전부 없다. DB가 통째로 유출돼도 secret(env) 없이는 어떤 코드도 계산할 수 없고, 코드는 필요한 두 시점에만 서버 메모리 안에 존재한다. 이메일 인증이 쓰던 "HMAC-SHA256 + env secret" 프리미티브의 재사용이기도 하다.
- 6자리 숫자를 쓰지 않는 이유: 코드가 세션과 문자를 잇는 유일한 값이므로 추측 곤란성이 필요하고, 공식 샘플 스스로 "실서비스는 예측 불가능한 문자열 권장"이라 명시한다. QR·딥링크·복사가 입력을 대신하므로 길이의 UX 비용은 낮다 (수동 폴백도 8자면 감내 가능).
- 본문은 코드 단독(접두사 없음): exists가 (번호, 본문) 쌍으로 스코프되므로 서비스명 식별이 불필요하고, 본문이 짧을수록 수동 발송·정확 일치에 유리하다.
- 코드 유니크 제약은 두지 않는다: v1(수신 목록에서 코드로 세션을 찾는 모델)에서는 코드가 유일 판별자였지만, exists 모델의 판별자는 **(번호, 코드) 쌍**이고 번호가 이미 UNIQUE다. 서로 다른 번호의 두 세션이 우연히 같은 코드를 가져도(≈2⁻⁴⁰) 서로 간섭하지 않는다.
- 잔여 노출면(수용): 발급 응답을 받은 브라우저와 사용자의 문자함에는 코드가 평문으로 존재한다 — 어떤 저장 방식으로도 제거할 수 없는 본질 노출이며, 번호 대조(Octomo)·5분 TTL·단일 사용이 방어선이다.

## 6. Polling — SSE·WebSocket 비교와 채택안

**폴링(3초) 채택.** 근거:

1. 우리 서버도 Octomo를 **pull**(exists)로만 알 수 있다. SSE/WS로 바꿔도 서버 내부 폴링은 그대로 남고, 절약되는 건 FE→BE HTTP 오버헤드뿐이다.
2. 세션은 5분 단명·저빈도(가입 이벤트)다. 3초 폴링 = 세션당 최대 100회, 실제 2~10회(§4.3 트리거 설계) — 최적화할 부하 자체가 없다.
3. SSE는 Caddy 프록시 버퍼링·유휴 타임아웃 설정, 연결 수 관리 등 운영 표면을 추가한다. WS는 그 이상. 현 규모에서 비용 > 이득.
4. FE 폴링은 이 코드베이스에 전례가 없지만 React Query `refetchInterval`로 표준적으로 구현된다 (완료·만료 시 `false` 반환으로 중단, 백그라운드 탭 중단).

서버 측 Octomo 호출 보호 (`MoPollThrottle`, in-memory):

- **세션당 exists 최소 간격 2.5초** — FE가 다중 탭 등으로 과폴링해도 Octomo 콜은 상한
- **전역 일일 상한 1,000콜** (KST 자정 롤오버) — 폭주·루프 버그로부터 Free 쿼터(월 1만) 보호. 초과 시 503 + Sentry 경보 → Pro 전환 판단
- 월 예산 추산: 가입 세션당 exists 2~10콜 + PC QR 1콜 → 월 300가입 기준 1,000~3,300콜로 Free 내 여유

## 7. API 설계

`/api/v1/auth/**`는 permitAll이라 SecurityConfig 변경 없음. 응답은 `ApiResponse` + machine-readable `code` 체계(기존) 유지.

### 7.1 인증 시작 — `POST /api/v1/auth/phone-verifications`

```json
// req
{ "phone": "010-1234-5678", "purpose": "SIGNUP" }
// res 201
{ "ok": true, "data": {
  "verificationToken": "550e8400-...",
  "code": "7K3M9PXQ",
  "moNumber": "16663538",
  "qrCode": "data:image/png;base64,...",
  "expiresAt": "2026-07-09T21:05:00",
  "expiresInSeconds": 300
} }
```

- 처리: IP 리밋 → purpose별 사전 검사 → 쿨다운 → 토큰 생성 upsert(코드는 토큰에서 파생, §5.2) → (PC 요청 시) QR 발급.
  - `SIGNUP`: 이미 가입된 번호(`existsByPhone`) → 409 `PHONE_ALREADY_REGISTERED`
  - `PHONE_CHANGE`(인증 필요): 본인 JWT 필수, 새 번호가 타인 소유면 409, `targetUserId=본인`
  - `PASSWORD_RESET`: §10.2의 시작 API가 내부적으로 이 발급을 수행 (직접 호출 불가)
- `qrCode`는 요청 쿼리 `?qr=true`일 때만 포함 (모바일은 불필요한 수 KB 절약 + Octomo QR 콜 절약). QR 발급 실패는 `qrCode: null`로 응답하고 FE가 텍스트 폴백 (발급 자체를 실패시키지 않음).

### 7.2 상태 조회 — `GET /api/v1/auth/phone-verifications/{verificationToken}`

```json
{ "ok": true, "data": { "status": "PENDING", "expiresInSeconds": 210, "maskedPhone": "010-****-5678" } }
```

- PENDING이면: 세션당 2.5초 스로틀·일일 상한 통과 시 `exists(phone, deriveCode(token), 5)` 호출 → true면 `verifiedAt` 기록(행잠금, 멱등)
- `VERIFIED` 응답에 `maskedPhone`을 실어 "이 번호로 인증됐어요" 확인 UX 제공
- Octomo 오류(타임아웃·5xx)는 삼키고 PENDING 반환 (FE는 계속 폴링, 서버는 log.error + Sentry) — 조회는 부작용이 없어 재시도 안전
- 미존재 토큰 404 `PHONE_VERIFICATION_NOT_FOUND`

### 7.3 회원가입 — `POST /api/v1/auth/signup` (변경)

- `SignupRequest`: **email·phone 제거**, **`verificationToken` 추가** (+ studentId `^\d{8}$`, name, password, grade, college, major, 약관 2종)
- 순서: 토큰으로 세션 조회(없으면 403) → `VERIFIED && purpose=SIGNUP && 인증 후 30분 내` 아니면 403 `PHONE_NOT_VERIFIED` → **phone = 세션의 번호** → `existsByStudentId || existsByPhone` → 409 `DuplicateAccountException`(필드 미특정 유지) → `User.create(..., phone, phoneVerifiedAt=now)` → consume(행 삭제)
- 폼에는 전화번호 입력란이 없다 — 번호는 인증 스텝에서만 입력되고, 저장 값은 항상 세션에서 나온다.

### 7.4 로그인 — `POST /api/v1/auth/login` (변경)

- `{ "studentId": "20241234", "password": "..." }` — **가입·로그인 모두 `^\d{8}$` 통일** (숫자 8자리 확정).
  - 전제: prod `users.student_id`가 전원 8자리임을 배포 전 확인 (`WHERE student_id !~ '^\d{8}$'` 0건 — 선행 작업 §17). 예외 데이터 발견 시 개별 정정 후 진행.
- `findByStudentIdForUpdate`(행잠금) / 미존재 시 `burnPasswordComparison` 타이밍 평탄화 / 계정 잠금 5회·15분 / IP 리미터 분10·시100 — 전부 기존 로직 식별자만 교체.
- 실패 메시지 "학번 또는 비밀번호가 올바르지 않습니다."

### 7.5 전화번호 변경 — `PATCH /api/v1/users/me/phone` (신규, B안 채택)

```json
{ "verificationToken": "..." }
```

- 세션 `VERIFIED && purpose=PHONE_CHANGE && targetUserId=본인 && 10분 내` → 중복 검사 → `user.changePhone(세션.phone, phoneVerifiedAt=now)` → consume → 감사 이벤트 기록
- `updateProfile`에서 phone 제거 (name·grade만 남음). **자유 수정(A안) 기각 근거**: 전화번호가 이메일 제거 후 유일한 연락 수단이자 비밀번호 재설정의 신원 근거가 되므로, 미검증 번호로 바꿀 수 있으면 (a) 지원자 연락처 신뢰가 다시 무너지고 (b) 계정 탈취자가 번호를 자기 것으로 바꿔 재설정 경로를 장악하는 단일 스텝이 된다. 재인증 비용은 문자 1건이라 UX 부담도 낮다.
- 부수 효과: 기존(무인증) 회원이 자기 번호 그대로 재인증하는 **소급 인증 경로**를 겸한다 (같은 번호 변경 허용).

### 7.6 비밀번호 재설정 (신규 — §10.2 플로우 상세)

- `POST /api/v1/auth/password-resets` `{ "studentId": "20241234" }` → 202 (균일 응답)
- `GET /api/v1/auth/phone-verifications/{token}` (공용 폴링)
- `POST /api/v1/auth/password-resets/complete` `{ "verificationToken": "...", "newPassword": "..." }` → 204

### 7.7 삭제되는 API

`POST /auth/email-verifications`, `POST /auth/email-verifications/confirm`. (`EMAIL_*` 예외·코드 전부 삭제)

### 7.8 에러 코드 (신규)

| code | HTTP | 상황 |
|---|---|---|
| `PHONE_ALREADY_REGISTERED` | 409 | 발급 시 이미 가입된 번호 |
| `PHONE_VERIFICATION_COOLDOWN` | 429 | 60초 내 재발급 |
| `VERIFICATION_RATE_LIMITED` | 429 | IP 한도 초과 (기존 코드 재사용) |
| `PHONE_VERIFICATION_NOT_FOUND` | 404 | 미존재 토큰 |
| `PHONE_NOT_VERIFIED` | 403 | 미인증·만료·용도 불일치 세션으로 완료 시도 |
| `SMS_POLL_QUOTA_EXCEEDED` | 503 | 일일 Octomo 콜 상한 초과 |
| `PASSWORD_RESET_NOT_ALLOWED` | 400 | 재설정 완료 조건 불충족 (계정·세션 불일치 등, 사유 미특정) |

## 8. Octomo 어댑터 — `global/mo/`

```
global/mo/
├── MoVerificationClient.java      (interface)
│     boolean messageExists(String mobileNum, String text, int withinMinutes)
│     Optional<String> createSmsQrCode(String text)   // 실패 시 empty (호출부가 폴백)
├── OctomoMoVerificationClient.java  @ConditionalOnProperty(mo.provider=octomo)
│     RestClient, connect/read 3s, Authorization: Octomo {key}
│     비2xx·타임아웃 → MoProviderException (호출부: exists는 PENDING 유지, QR은 empty)
├── StubMoVerificationClient.java    @ConditionalOnProperty(..., havingValue=stub, matchIfMissing=true)
│     테스트: (번호,본문) 쌍 주입식. 로컬: mo.stub.auto-verify-after-seconds 옵션
├── OctomoProperties.java            @ConfigurationProperties(prefix="octomo") — apiKey, baseUrl
└── MoProviderException.java
```

```yaml
mo:
  provider: ${MO_PROVIDER:stub}        # stub | octomo
  inbound-number: "16663538"           # 수신 대표번호 — 벤더 중립 키 (안내·딥링크·QR 본문용)
phone-verification:
  secret: ${PHONE_VERIFICATION_SECRET} # 코드 파생 HMAC 키 — 기본값 없음(필수)
octomo:
  api-key: ${OCTOMO_API_KEY:}
  base-url: https://api.octoverse.kr
```

- 재시도 정책: **없음**. exists는 폴링 자체가 재시도이고, QR은 폴백(텍스트 안내)이 있다. 재시도 루프는 지연·쿼터만 태운다.
- **어댑터 추상화 수준에 대한 정직한 평가**: 이 포트는 "MO형(exists/QR) 벤더" 교체에만 유효하다. PASS·NICE 등 본인확인기관 연동은 리다이렉트/앱 인증 등 **플로우 자체가 달라** 어댑터 교체로 흡수되지 않는다 — 그때는 `purpose` 세션 모델 위에 "인증 방법"을 추가하는 상위 설계 변경이며, 지금 그 추상화를 미리 만드는 것은 YAGNI로 판단해 하지 않는다. 현 포트의 역할은 (a) Octomo 스펙 불확실성 격리, (b) 테스트 스텁, (c) 동급 MO 벤더 교체까지다.

## 9. 도메인·DB 설계

### 9.1 users 변경 — phone_hash·암호화 검토 결과

**추가하는 것: `phone_verified_at TIMESTAMP NULL`** 하나뿐이다.

- null = 미인증(레거시 자기신고 번호), not null = MO 인증 완료. 운영 구분·소급 인증 유도·향후 정책 분기의 근거.
- **`phone_verification_method` 기각**: 인증 방법이 MO 하나뿐이라 정보량이 0이다. PASS 등 추가 시점에 컬럼을 더하면 되고, 그때까지는 `phone_verified_at != null ⇒ MO`로 충분 (YAGNI).
- **`phone_hash` 기각**: 해시 컬럼의 존재 이유는 "평문을 저장하지 않으면서 동등 검색·유니크를 유지"하는 blind index다. 우리는 평문을 유지하므로(아래) 기존 부분 유니크 인덱스(`ux_users_phone`)가 중복가입 방지·동일번호 조회를 이미 해결한다 — 해시 컬럼은 중복 데이터일 뿐이다. *만약* 나중에 암호화 저장으로 전환한다면 그때는 **HMAC-SHA-256(비밀키)** 이어야 한다: 전화번호 공간이 ~10^8뿐이라 무염 SHA-256은 전수 사전 계산으로 즉시 역산된다. 키 없는 해시는 이 데이터에서 가명화가 아니다.
- **AES-GCM 암호화 저장 기각 (현 시점)**: 전화번호는 지원자 연락처 표시·마스킹·중복 검사·CSV 내보내기 등 **실사용이 많은 운영 데이터**다. 앱레벨 암호화를 도입하면 (a) 동등 검색·유니크 제약을 blind index로 재구축, (b) 키 관리(보관·회전·백업 복호화), (c) 마스킹·검색·수출 경로 전면 수정이 따라온다. 현 위협 모델(단일 서비스, Supabase 디스크 at-rest 암호화, DB 접근자 = 운영자 1인)에서 이 비용 대비 이득이 없다. 유출 리스크는 로그 금지·마스킹 유틸(`PhoneMasker` 기존)·PII 파기 잡(45일)으로 관리한다. 회원 수·운영 인원·규제 요구가 커지면 재검토.

### 9.2 마이그레이션

**V79 — `V79__create_phone_verifications_and_events.sql`** (PR1):

```sql
CREATE TABLE IF NOT EXISTS phone_verifications (
    id              BIGSERIAL    PRIMARY KEY,
    phone           VARCHAR(13)  NOT NULL,
    token           VARCHAR(36)  NOT NULL,
    purpose         VARCHAR(20)  NOT NULL,
    target_user_id  BIGINT,
    expires_at      TIMESTAMP    NOT NULL,
    verified_at     TIMESTAMP,
    last_issued_at  TIMESTAMP    NOT NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_phone_verifications_phone ON phone_verifications (phone);
CREATE UNIQUE INDEX IF NOT EXISTS uk_phone_verifications_token ON phone_verifications (token);

CREATE TABLE IF NOT EXISTS phone_verification_events (
    id           BIGSERIAL    PRIMARY KEY,
    user_id      BIGINT,
    phone        VARCHAR(13)  NOT NULL,
    purpose      VARCHAR(20)  NOT NULL,
    event_type   VARCHAR(20)  NOT NULL,          -- VERIFIED | CONSUMED
    client_ip    VARCHAR(45),
    user_agent   VARCHAR(300),
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pve_phone ON phone_verification_events (phone);
CREATE INDEX IF NOT EXISTS idx_pve_user  ON phone_verification_events (user_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMP;
```

**V80 — `V80__users_email_nullable_clear_verifications.sql`** (PR2): `ALTER TABLE users ALTER COLUMN email DROP NOT NULL; TRUNCATE TABLE email_verifications;` — email 컬럼·email_verifications 테이블은 **drop하지 않는다** (구 이미지 롤백 안전, expand/contract). 물리 drop은 PR5의 후속 마이그레이션에서.

### 9.3 인증 감사 로그 — 채택 (경량)

`phone_verification_events` (insert-only, 조회 화면 없음 — 운영자가 DB 콘솔로):

- 기록 시점: `VERIFIED` 전이(인증 성공), `CONSUMED`(가입·번호변경·재설정 완료 — user_id 포함)
- 가치: "내 학번이 도용됐다" 분쟁 시 어느 번호·언제·어떤 IP로 인증했는지 추적, 번호 변경 전 이력 보존(users.phone은 덮어써짐), abuse 패턴 탐지. `ClubMemberHistory` 감사 전례와 결이 같다.
- PII: phone 평문 포함 → **PII 파기 잡에 편입, 45일 경과 행 삭제**. 실패(exists=false)는 "아직 안 옴"과 구분 불가라 기록하지 않는다.

### 9.4 정리 잡

기존 PII 파기 잡에 2개 대상 추가: 만료 후 24시간 지난 `phone_verifications` 행 삭제(버려진 세션의 번호 잔존 방지), 45일 지난 `phone_verification_events` 삭제. (`email_verifications` 정리 로직은 PR2에서 제거)

### 9.5 동시성

- 발급 upsert: 행 없음 insert race → phone UNIQUE 위반 → 재조회 후 쿨다운 재평가(429). 행 있음 → `findByPhoneForUpdate` 행잠금 후 쿨다운 검사 (이메일 인증 §7.3 패턴 그대로)
- 코드 충돌: 해당 없음 — 코드는 토큰(UUID)에서 파생되므로 저장·충돌 개념 자체가 없다 (§5.2)
- 매칭 race: 상태조회 2건 동시 → `findByTokenForUpdate` 잠금 후 PENDING일 때만 `markVerified` (멱등)
- signup race: 같은 번호로 세션 2개는 불가(phone UNIQUE)지만, 인증→가입 사이 창에서의 이중 가입은 `ux_users_phone`·`uk_users_student_id_active`가 최종 방어

## 10. 신규 플로우 상세

### 10.1 전화번호 변경 (로그인 상태)

```
설정 → [전화번호 변경] → 새 번호 입력 → MO 인증(§4 공통 UX, purpose=PHONE_CHANGE)
→ VERIFIED → PATCH /users/me/phone {verificationToken} → 교체 + phone_verified_at 갱신
```

### 10.2 비밀번호 재설정 (비로그인)

```
/forgot-password → 학번 입력 → POST /auth/password-resets
  · 계정 존재 && phone 보유 → 등록 번호로 세션 생성(purpose=PASSWORD_RESET, targetUserId)
    → 응답에 maskedPhone("010-****-5678") + 코드·QR·토큰
  · 계정 미존재 → 400 "등록된 정보를 확인할 수 없습니다" (사유 미특정)
→ 사용자가 **등록된 번호로** 문자 발송 → 폴링 VERIFIED
→ 새 비밀번호 입력 → POST /auth/password-resets/complete {verificationToken, newPassword}
  · 세션 VERIFIED && purpose && targetUserId 일치 && 10분 내 → 변경 + tokenVersion bump(전 기기 로그아웃) + CONSUMED 감사
```

- 설계 요점: **번호를 입력받지 않는다** — 계정에 등록된(대부분 MO 인증된) 번호로만 인증 가능하므로, 공격자가 자기 번호를 끼워 넣을 통로가 없다. 재설정 성공 조건 = 그 계정의 등록 번호 실소유.
- 계정 열거: 학번 존재 여부가 응답에서 드러난다(존재 시 maskedPhone 노출). 학번은 이메일과 달리 준공개 식별자(수강·학생회 명부 등)이고 로그인 계정 잠금이 이미 계정 단위로 존재해, 균일 202 + 가짜 세션까지 만드는 비용 대비 이득이 낮다 — **수용 리스크**로 명시하고 시작 API에 학번당 시간당 3회 리밋을 건다.
- 레거시 예외: phone이 더미(`010-0000-0000`)이거나 잘못 신고된 회원은 재설정 불가 → 운영자 수동 채널 (기존과 동일한 상태이므로 악화는 아님).

## 11. 레이트리밋 총람

전부 in-memory (기존 `EmailVerificationRateLimiter`·`LoginAttemptRateLimiter` 컨벤션, 단일 인스턴스 전제 Javadoc 명시. Redis 전환 시 이 컴포넌트들만 교체).

| 축 | 정책 | 구현 위치 |
|---|---|---|
| IP — 인증 시작 | 분 10 / 시 60 | `PhoneVerificationRateLimiter` |
| IP — 상태 조회 | 분 30 / 시 200 | 〃 (폴링 3초=분 20회와 여유) |
| 번호 — 재발급 | 60초 쿨다운 | DB 행(`last_issued_at`) — 인스턴스 무관 |
| 세션 — Octomo 실호출 | 최소 간격 2.5초 | `MoPollThrottle` |
| 전역 — Octomo 일일 | 1,000콜 → 503 | 〃 |
| 학번 — 재설정 시작 | 시간당 3회 | `PhoneVerificationRateLimiter` |
| 학번(계정) — 로그인 | 5회 실패 15분 잠금 (기존) | `User.recordFailedLogin` |
| IP — 로그인 | 분 10 / 시 100 (기존) | `LoginAttemptRateLimiter` |

### 11.1 Redis 전환 계획

지금 Redis를 도입하지 않는 이유는 규모가 아니라 **구조**다: 백엔드가 단일 인스턴스라 Redis의 본질 가치(인스턴스 간 공유 상태)가 발휘될 곳이 없고, 관리 인프라(기동·모니터링·백업·별도 장애 도메인)만 늘어난다. in-memory 리미터가 재시작 시 리셋되는 것은 이메일 인증 도입 때부터 수용해 온 트레이드오프다.

**전환 트리거**: 백엔드를 2개 이상 인스턴스로 수평 확장하는 시점(또는 신·구 인스턴스가 동시에 뜨는 무중단 배포 구성 채택 시). 그 순간부터 in-memory 카운터가 인스턴스별로 쪼개져 IP 리밋 상한이 N배로 느슨해지고, 일일 Octomo 쿼터 카운터가 갈라져 상한 보호가 깨진다 — 이것이 도입해야 하는 신호다.

**교체 경계 (전부 이번 구현에서 컴포넌트로 격리됨)**:

| 대상 | 현재 구현 | Redis 전환 시 |
|---|---|---|
| `PhoneVerificationRateLimiter` | in-memory 슬라이딩 윈도우 | `INCR` + `EXPIRE` 윈도우 카운터 |
| `MoPollThrottle` | in-memory 세션 간격 + 일일 카운터 | `SET NX PX`(세션 간격) + `INCR` + 자정 TTL(일일 쿼터) |
| 세션 저장소 (`phone_verifications`) | PG 테이블 | **PG 유지 권장** — 세션은 signup 트랜잭션·감사 이벤트와 정합이 필요하고 행 수가 작아 옮길 이득이 없다. 리미터·스로틀만 Redis로 가면 멀티 인스턴스 문제는 전부 해소된다 |

도메인 서비스·API 계약·FE는 전환과 무관하다 — 위 컴포넌트의 구현체만 교체한다.

## 12. 보안 체크리스트 (요구 §5 대응 + 추가)

- API Key 백엔드 전용(§3), FE 노출 불가 구조
- 코드 40bit·단일 사용·5분 TTL·**DB 미저장(토큰 HMAC 파생)** — DB 유출 시에도 secret(env) 없이는 활성 코드 계산 불가 (§5.2)
- Replay: exists가 `withinMinutes=5`로 시간 창을 강제 + 세션 consume + 재발급 시 구 코드 무효 — 같은 문자를 다시 쓸 수 있는 창이 이중으로 닫힘
- 세션 토큰: UUID 불투명 핸들, URL에 PII 없음, 응답에 번호는 마스킹만
- 계정 열거: 가입 중복 409 필드 미특정(기존), 로그인 타이밍 평탄화(기존 이식), 재설정은 §10.2 수용 리스크 문서화
- 로그: 번호는 `PhoneMasker` 경유만, 코드·토큰 로그 금지 (기존 "비밀번호·토큰 로그 금지" 규칙에 명시 추가)
- 추가 제안 — **인증 성공 감사 로그**(§9.3), **전화번호 변경 재인증**(§7.5)으로 재설정 경로 탈취 차단, 문자 발송 안내에 "본문 수정 금지" 명시(사회공학으로 타인에게 코드 전송 요청하는 시나리오 완화에는 한계가 있음 — 코드만 아는 제3자는 인증 불가한 구조가 본질 방어)

## 13. email 제거 영향 전수 (v1 유지)

### 백엔드
`UserResponse`·`UserQuery`·`UserSearchResultQuery`·`AdminUserSearchResponse`·`ApplicantQuery`·`ApplicantDetailQuery`에서 email 제거 / admin 검색 JPQL `LOWER(u.email) LIKE` 조건 제거(이름·학번 유지) / `ALLOWED_ADMIN_USER_SORT`에서 `"email"` 제거 / `anonymizeExpiredUsers` native SQL email 라인 `NULL`화(PR5에서 컬럼과 함께 삭제) / `SignupRequest`·`LoginRequest`·인증 DTO의 email 검증 제거 / `User.create` 시그니처에서 email 제거.

### 프론트엔드
`ApplicantProfilePanel` 이메일 행 삭제(전화·학번 유지) / `MyPageHeader` 📨 email → 📞 phone / `SettingsPage` 이메일 행+인증 배지 삭제 / `LeaderSearchCombobox` `{studentId} · {email}` → `{studentId} · {name}` / `packages/types` `User`·`Applicant`·`ApplicantDetail`·`AdminUser`에서 email 제거.

### 메일 인프라 (PR5)
`global/email/*`·`MailProviderConfig`·`ResendClientConfig`·`spring.mail`/`email.*`/`resend.*`/`brevo.*` 설정·`spring-boot-starter-mail` 의존성·메일 테스트 4종 제거. env `RESEND_API_KEY`·`BREVO_*`·`EMAIL_PROVIDER`·`EMAIL_VERIFICATION_SECRET` 정리. **`management.health.mail.enabled=false`는 삭제하지 않는다** (배포 롤백 루프 전례 — 스타터 제거 후엔 무해한 잔존 설정, 주석만 갱신).

## 14. 프론트엔드 구현 구조

컨벤션 경로: `packages/types` → `packages/api/client.ts` → `packages/hooks` → `_components` → `_pages` → 테스트.

- **타입**: `StartPhoneVerificationPayload{phone, purpose}`, `PhoneVerificationSession{verificationToken, code, moNumber, qrCode?, expiresAt, expiresInSeconds}`, `PhoneVerificationStatus{status, expiresInSeconds, maskedPhone?}`, `LoginPayload{studentId, password}`, `SignupPayload`(email·phone 제거, verificationToken 추가), 재설정·번호변경 payload. email 관련 타입 삭제.
- **훅**: `useStartPhoneVerificationMutation`, `usePhoneVerificationStatusQuery(token, {enabled, refetchInterval: 3000})`, `useCompletePasswordResetMutation`, `useChangePhoneMutation`. queryKeys `auth.phoneVerification(token)`.
- **컴포넌트**: `PhoneVerificationField` — 상태머신 `idle → issued(안내·미폴링) → waiting(보냈어요 클릭, 폴링) → verified | expired`. UA 분기 딥링크 버튼 + QR(PC, `?qr=true`) + 코드 복사 + 만료 카운트다운(`expiresInSeconds` 단일 진실원천, 기존 setInterval 틱 패턴) + 60초 재발급 쿨다운 + 5분 타임아웃 UI. `latestPhoneRef` stale 가드 계승.
- **가입 폼**: 독립 phone 입력란 제거, `PhoneVerificationField`가 번호 입력을 소유. `canSubmit`에 `verified` 게이트. signup 403 `PHONE_NOT_VERIFIED` → 인증 스텝 복귀.
- **로그인 폼**: 학번 8자리(`inputMode=numeric`, `maxLength 8`, `/^\d{8}$/`), "비밀번호를 잊으셨나요?" 링크는 신설 `/forgot-password`로 유지.
- **신설 페이지**: `/forgot-password` (학번 입력 → 인증 → 새 비밀번호), 설정 내 전화번호 변경 다이얼로그 (기존 `ProfileEditDialog`에서 phone 분리).
- **삭제**: `SignupStepAccount/Profile.tsx`(dead code), `EmailVerificationField`, `use-email-verification`, `_lib/email-verification.ts`, email 훅·client 메서드·스키마.

## 15. 테스트 전략

날짜는 상대값만 (CI 타임밤 금지). `StubMoVerificationClient` 주입식 — `(번호, 본문)` 쌍 등록 후 exists 시뮬레이션.

**백엔드 통합** (TestContainers PG16 + RestAssured): 시작→스텁 등록→폴링 VERIFIED→signup 해피패스·행 삭제 / 미등록 쌍 PENDING 유지 / 만료 EXPIRED·만료 후 signup 403 / VERIFIED 30분 초과 signup 403 / 쿨다운 429·재발급 후 구 코드 무효 / 가입된 번호 409 / 타 purpose 토큰으로 signup 403 / 미존재 토큰 404 / IP·일일상한 리밋 / 8자리 로그인 성공·실패·잠금·타이밍 평탄화 / 번호 변경 재인증 플로우·타인 번호 409 / 재설정 해피패스·tokenVersion bump·타 계정 토큰 400 / 감사 이벤트 기록 / me·admin 검색 응답 email 부재.

**백엔드 단위**: `PhoneVerificationCodeDeriver`(동일 토큰 → 동일 코드 결정성, 토큰 상이 시 코드 상이, 8자 Base32·혼동문자 제외, secret 미설정 시 기동 실패), 세션 도메인 메서드(상태 판정·용도별 완료 창·reissue 리셋), `MoPollThrottle`(간격·일일 롤오버), `OctomoMoVerificationClient`(MockRestServiceServer — 헤더·성공/비2xx/타임아웃 변환).

**프론트**: `PhoneVerificationField` 상태 전이·복사·재발급·타임아웃, 폴링 훅(fake timers) 시작/중단/stale 가드, 딥링크 URL 생성 UA 분기 유틸, 스키마(8자리 학번), 재설정 페이지 플로우, signup 403 복귀. **딥링크·QR 실기기 QA는 자동화 불가 — 선행 작업 체크리스트로** (jsdom이 못 잡는 영역).

## 16. 배포 전환 전략 (PR 분할)

| PR | 내용 | 비고 |
|---|---|---|
| **PR1** `feat/{이슈}-phone-mo-verification-api` | V79 + 세션·감사 도메인 + `global/mo/` + 시작·상태조회 API + 리밋/스로틀 + 테스트 | 기존 플로우 무변경. 배포 후 curl+실기기 스모크 |
| **PR2** `feat/{이슈}-student-id-login-switch` | V80 + 로그인 studentId 전환 + signup 전환(verificationToken) + 이메일 인증 API 삭제 + email 노출 제거 + PII 잡 수정 + REQUIREMENTS.md 개정 | breaking — PR3과 근접 배포 |
| **PR3** `feat/{이슈}-signup-login-phone-mo-ui` | FE 가입·로그인 전환 + dead code 삭제 | PR2 직후 |
| **PR4** `feat/{이슈}-phone-change-password-reset` | BE+FE: 번호 변경 재인증 + 비밀번호 재설정 + `/forgot-password` | 신기능 — 전환과 독립, PR3 이후 |
| **PR5** `chore/{이슈}-email-infra-removal` | email 컬럼·email_verifications drop 마이그레이션 + 메일 인프라·설정·env 제거 | 안정화 1~2주 후 |

- PR2~3 사이 수 분간 구FE↔신BE 불일치로 **로그인·가입만** 실패 (기존 세션은 JWT 불변으로 무영향). 방학 저트래픽 시간대 배포. 과도기 겸용 코드는 기각 (메일 인프라 유지가 강제됨).
- 롤백: email nullable + 테이블 보존으로 PR2·3 독립 롤백 가능. 단 전환 후 신규 가입자는 email=NULL이라 구 버전에서 로그인 불가 — 롤백은 전환 직후 조기 결정 원칙.

## 17. 선행 작업 (코드 외)

- [ ] Octomo 회원가입 → API Key 발급, 로그인 후 문서로 최종 확인: exists 본문 매칭 방식(정확 일치 vs 포함), `mobileNum` 포맷(하이픈 유무), QR API 정확 스펙, (있다면) HMAC 서명 요건
- [ ] **prod 학번 8자리 전수 확인**: `SELECT count(*) FROM users WHERE student_id !~ '^\d{8}$'` = 0 (예외 발견 시 개별 정정 후 PR2 배포)
- [ ] 실기기 딥링크 QA: iOS Safari / iOS Chrome / Android Chrome / Samsung Internet / 카카오톡 인앱 — `sms:` body 프리필 + QR 스캔 각각 확인, 결과로 UA 분기 확정
- [ ] prod env 등록: `MO_PROVIDER=octomo`, `OCTOMO_API_KEY`, `PHONE_VERIFICATION_SECRET` (CI Secret. 로컬 `.env`에도 추가)
- [ ] 전환 배포 시간대 결정 + 공지 문구

## 18. 명시적으로 감수하는 리스크

- **학번 도용/오기입** — SMS 인증은 실기기 소유만 증명. 타인 학번 선점 가입은 학번 유니크로 "선점"에 국한, 분쟁은 감사 로그(§9.3) 근거로 운영자 수동 처리
- **재학생 여부 미검증** — 형식만 맞으면 가입 가능
- **Octomo 의존** — 무료 외부 서비스. 장애 시 가입·번호변경·재설정 불가(로그인 무영향), Sentry 감시, 포트 격리로 동급 벤더 교체 여지. 사업 종료 시나리오는 MT(발송형) 전환 재설계 각오
- **SMS 발신 불가층** — 데이터 전용 요금제·해외 체류 가입 불가. 문자 요금 사용자 부담(안내 문구로 고지)
- **재설정 플로우의 학번 존재 노출** — §10.2 수용 근거 명시
- **인앱 브라우저 딥링크 실패 가능성** — 수동 발송 폴백이 보장 경로라 기능 차단은 없음
- **기존 회원 phone 정확성** — 무인증 자기신고 값. 번호 변경 재인증(§7.5)이 소급 개선 경로

## 19. 요구 검토 항목별 결정 총람

| 검토 항목 | 결정 | 근거 위치 |
|---|---|---|
| Octomo 호출 주체 | **Backend 확정** | §3 |
| 모바일 SMS 딥링크 | 점진적 개선 + 수동 폴백 보장, 실기기 QA 선행 | §4.1 |
| PC QR | Octomo QR API 경유, 캐싱 불필요(세션당 1회) | §2.2·4.2 |
| Port-Adapter | 채택하되 "MO형 벤더까지"로 한계 명시 (PASS/NICE는 별개 설계) | §8 |
| 세션 저장 | DB (Redis 현 시점 기각 — 전환 트리거·경로는 §11.1) | §5.1·11.1 |
| VERIFIED 24h 유지 | 기각 → 용도별 30분/10분 | §5.1 |
| 코드 재사용 차단 | consume 삭제 + 재발급 시 토큰·코드 동시 무효 + withinMinutes=5 | §5.1·12 |
| 인증 코드 암호화 저장 | **상위 호환 채택 — DB 미저장(토큰 HMAC 파생)**. AES 저장과 동일 보호를 더 적은 장치로 달성 | §5.2 |
| Polling vs SSE/WS | 폴링 3초 (서버도 pull만 가능, 규모상 이득 없음) | §6 |
| 폴링 시작 시점 | "보냈어요" 클릭 후 (쿼터 절약) | §4.3 |
| Timeout | 폴링 5분(세션 TTL과 일치), Octomo HTTP 3초, 재시도 없음 | §5.1·8 |
| 휴대폰 입력란 제거 | **부분 채택** — 폼에서 제거, 인증 스텝이 소유 (exists API 제약상 완전 무입력 불가) | §2.1·7.3 |
| 학번 8자리 확정 | 채택 (가입·로그인 `^\d{8}$`) + prod 전수 확인 선행 | §7.4·17 |
| 전화번호 변경 | **B안 — MO 재인증 필수** | §7.5 |
| 비밀번호 재설정 | MO 기반 신설, 등록 번호로만 인증(번호 입력 없음) | §10.2 |
| phone_hash | 기각 (평문 유지 시 무용. 도입한다면 HMAC 필수 — 무염 SHA-256은 역산 가능) | §9.1 |
| phone 암호화(AES-GCM) | 기각 (현 규모 비용>이득, 재검토 조건 명시) | §9.1 |
| phone_verified_at | 채택 | §9.1 |
| phone_verification_method | 기각 (YAGNI) | §9.1 |
| 인증 감사 로그 | 채택 (경량 insert-only + 45일 파기) | §9.3 |
| Rate Limit 4축 | IP·번호·학번·세션 전부 반영 + Redis 교체 경계 | §11·11.1 |
| 기존 문서(v1) 리뷰 | 목록 조회 가정·해시 저장·발신자 매칭·서비스명·전역 캐시 폐기, 세션 purpose 일반화로 재설계 | §2 |

## 20. Out of Scope

- SSO / 대구대 통합 인증, 학사시스템 실재학 검증
- 기존 회원 휴대폰 소급 인증 **의무화** (§7.5가 자발 경로 제공)
- Redis 도입, 멀티 인스턴스 대응 (전환 계획·경계는 §11.1로 명세만 확보)
- PASS·NICE 등 본인확인기관 연동 (§8 한계 명시)
- RN 앱 구현 (packages 구조 호환만 유지)
- 회원가입 외 용도의 MO 인증 추가 확장 (중요 작업 재인증 등)

## 21. 열린 질문

- **Q1. VERIFIED 완료 창**: SIGNUP 30분 / PHONE_CHANGE·PASSWORD_RESET 10분 — 적절한지
- **Q2. 이메일 물리 삭제 시점**: PR5(안정화 1~2주 후) 유지 여부
- **Q3. 배포 시간대**: PR2~3 근접 배포 일정
- **Q4. 감사 로그 보존 기간**: 45일(기존 PII 파기 잡 기준) vs 더 길게
