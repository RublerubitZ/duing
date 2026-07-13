# Liveness·Readiness Health Check 2단계 구현 계획

> 이 계획은 운영에 #642 이전 백엔드 이미지가 실행 중이라는 조건을 반영한다. 새 probe를 제공하는 1단계와
> 운영 판정 소비자를 전환하는 2단계를 별도 PR·배포로 진행한다.

**Goal:** Spring Boot의 생존 상태와 PostgreSQL을 포함한 요청 처리 준비 상태를 분리하되, 기존 운영 이미지로의
롤백 가능성을 유지하면서 안전하게 운영 판정을 전환한다.

**Architecture:** Spring Boot Actuator health group에 `livenessState`와 `readinessState,db`를 명시하고 세
health 경로만 공개한다. 1단계는 endpoint만 운영에 제공하고 기존 종합 health 기반 Docker·배포 판정을 유지한다.
1단계가 운영에서 검증된 뒤 별도 2단계 PR에서 Docker는 liveness, 배포 성공·롤백 확인은 readiness를 사용한다.

**Tech Stack:** Java 21, Spring Boot 3.4.1 Actuator, Spring Security, JUnit 5, RestAssured,
Testcontainers PostgreSQL, HikariCP, Docker Compose, GitHub Actions, Bash

---

## 전역 제약

- `GET /actuator/health/liveness`는 `livenessState`만 포함하고 DB 장애와 독립적이어야 한다.
- `GET /actuator/health/readiness`는 `readinessState,db`만 포함하며 PostgreSQL 장애 시 HTTP 503을 반환한다.
- `management.endpoint.health.probes.enabled=true`를 명시해 Docker Compose·로컬·테스트에서 probe를 활성화한다.
- `/actuator/health`, `/actuator/health/liveness`, `/actuator/health/readiness`만 인증 없이 허용한다.
- 모든 공개 health 응답은 `show-details=never`를 유지한다.
- 1단계에서 `.github/workflows/deploy-backend.yml`, `deploy/docker-compose.yml`, `deploy/README.md`를 변경하지 않는다.
- 2단계는 1단계 운영 배포와 스모크 테스트가 성공한 뒤 최신 `develop`에서 별도 브랜치·PR로 수행한다.
- 2단계의 자동 롤백 대상은 probe 계약을 지원하는 1단계 이후 이미지로 제한한다.
- #642 이전 이미지의 401/404를 성공이나 호환 신호로 해석하지 않고, 인증 공개 범위를 완화하지 않는다.
- DB 스키마, 비즈니스 API, Caddy upstream, 외부 모니터링은 변경하지 않는다.

## 파일 책임

### 1단계 — 현재 브랜치

- `backend/src/main/resources/application.yml`: probe 활성화와 health group을 정의한다.
- `backend/src/test/resources/application.yml`: 테스트 resource shadowing 환경에도 같은 계약을 정의한다.
- `backend/src/main/java/com/duing/global/config/SecurityConfig.java`: 정확한 세 health 경로만 익명 허용한다.
- `backend/src/test/java/com/duing/global/ActuatorHealthAcceptanceTest.java`: 정상 응답과 정보 비노출을 검증한다.
- `backend/src/test/java/com/duing/global/ActuatorDatabaseOutageAcceptanceTest.java`: DB 장애 시 liveness/readiness 분리를 검증한다.
- `backend/README.md`: 세 endpoint의 의미와 로컬 확인 방법을 설명한다.
- 설계·계획 문서: 2단계 운영 전환 조건과 롤백 범위를 기록한다.

### 2단계 — 운영 검증 후 별도 브랜치

- `deploy/docker-compose.yml`: Docker healthcheck를 liveness로 전환한다.
- `.github/workflows/deploy-backend.yml`: 신규 이미지와 롤백 이미지의 readiness를 검증한다.
- `deploy/README.md`: 전환된 운영 판정과 수동 점검 절차를 설명한다.

---

## Task 1: Probe endpoint 계약 구현 — 현재 PR

### Step 1: 실패하는 인수 테스트 작성

정상 DB 상태에서 다음을 검증한다.

- 종합 health, liveness, readiness가 인증 없이 200과 `UP`을 반환한다.
- 세 응답에 `components`와 `details`가 없다.
- 임의의 `/actuator/health/db`는 공개되지 않는다.

별도 Spring context에서 Hikari DataSource를 종료해 다음을 검증한다.

- readiness는 503과 비정상 상태를 반환한다.
- 같은 시점의 liveness는 200과 `UP`을 유지한다.
- 장애 readiness에도 내부 상세 정보가 없다.

### Step 2: 최소 구현

운영·테스트 설정에 다음 계약을 동일하게 추가한다.

```yaml
management:
  endpoint:
    health:
      probes:
        enabled: true
      group:
        liveness:
          include: "livenessState"
        readiness:
          include: "readinessState,db"
      show-details: never
```

Spring Security는 다음 정확 경로만 기존 공개 목록에 추가한다.

```text
/actuator/health
/actuator/health/liveness
/actuator/health/readiness
```

### Step 3: 검증

```bash
cd backend
./gradlew test --tests 'com.duing.global.ActuatorHealthAcceptanceTest' \
  --tests 'com.duing.global.ActuatorDatabaseOutageAcceptanceTest'
./gradlew test
./gradlew build -x test
```

정상·DB 장애 계약, 정보 비노출, 기존 테스트 회귀가 모두 없어야 한다.

---

## Task 2: 1단계 운영 호환성 고정 — 현재 PR

### Step 1: 소비자 설정 유지

다음 파일은 분기 기준 커밋과 정확히 같아야 한다.

```bash
git diff --exit-code 8ad89482 -- \
  .github/workflows/deploy-backend.yml \
  deploy/docker-compose.yml \
  deploy/README.md
```

이 단계의 Docker와 배포 자동화는 기존 `/actuator/health`를 계속 사용한다. 운영의 #642 이전 이미지가 새 probe
경로를 익명 요청에 대해 401로 응답하므로, endpoint 제공과 소비자 전환을 같은 배포에 포함하지 않는다.

### Step 2: 문서 검증

설계와 계획은 다음을 명확히 구분해야 한다.

- 현재 PR은 probe 제공·보안·테스트·백엔드 문서만 포함한다.
- Docker liveness 및 배포 readiness 전환은 후속 PR이다.
- #642 이전 이미지에 대한 404 폴백을 제공한다고 주장하지 않는다.
- 2단계는 probe 지원 이미지로만 자동 롤백한다.

### Step 3: 커밋

```bash
git commit -m "[#642] Health Check 운영 전환을 2단계로 분리"
```

---

## Task 3: 1단계 운영 배포 및 스모크 테스트 — PR 머지 후

1단계 이미지가 운영에 배포된 뒤 다음을 확인한다.

```bash
curl -fsS https://api.duings.com/actuator/health
curl -fsS https://api.duings.com/actuator/health/liveness
curl -fsS https://api.duings.com/actuator/health/readiness
```

성공 기준:

- 정상 DB 상태에서 세 요청이 모두 HTTP 200과 `UP`을 반환한다.
- `components`, `details`, DB 주소, 오류 메시지가 노출되지 않는다.
- 기존 Docker healthcheck가 정상이고 배포 성공·이전 이미지 롤백 절차가 깨지지 않는다.
- 운영 로그와 Sentry에 probe 도입으로 인한 예외가 없다.

이 검증이 끝나기 전에는 Task 4 브랜치를 생성하지 않는다.

---

## Task 4: Docker·배포 판정 전환 — 별도 후속 PR

최신 `develop`에서 새 브랜치를 만든다. 이 시점의 운영 롤백 대상은 모두 Task 1 probe 계약을 지원해야 한다.

### Step 1: Docker liveness 전환

- Docker healthcheck가 `/actuator/health/liveness`를 호출하게 한다.
- curl 연결·전체 timeout은 Docker healthcheck timeout보다 짧아야 한다.
- curl 종료 코드를 먼저 확인하고 부분 출력의 `200`을 성공으로 오인하지 않는다.
- `restart: unless-stopped`가 `unhealthy`만으로 자동 재시작하지 않는다는 운영 의미를 문서화한다.

### Step 2: 배포 readiness 전환

- 새 이미지의 성공 조건을 `/actuator/health/readiness` HTTP 200으로 변경한다.
- 연결·요청 timeout, 재시도 간격·횟수, SSH action과 job 전체 제한을 수식으로 검증한다.
- 실패 시 직전 이미지로 롤백하고, 롤백 이미지의 readiness도 확인한다.
- readiness 401/404는 호환 폴백으로 처리하지 않는다. 이는 잘못된 롤백 이미지 또는 보안 계약 회귀다.
- 복구 가능한 probe 지원 이미지가 없으면 명확한 오류로 실패하고 수동 복구를 요구한다.

### Step 3: 설정·셸 테스트

- `docker compose config`로 Compose 렌더링을 검증한다.
- 신규·롤백 모드에서 200, 401, 404, 503, curl 실패 케이스를 셸 수준으로 검증한다.
- workflow YAML과 추출한 SSH script의 `bash -n`을 검증한다.
- 배포 문서와 실제 timeout·재시도 값이 일치하는지 확인한다.

### Step 4: 운영 배포

후속 PR 머지 후 liveness, readiness, 핵심 API를 각각 스모크 테스트한다. readiness 장애 때 단일 Caddy upstream을
자동 제거하거나 컨테이너를 재시작하는 기능은 이 작업에 추가하지 않는다.

---

## 최종 성공 조건

### 1단계

- 정상 상태에서 liveness와 readiness가 모두 200이다.
- 기동 후 DB 연결 장애에서 liveness는 200, readiness는 503이다.
- 공개 health 응답에 내부 component와 상세 오류가 없다.
- 기존 `/actuator/health`가 유지된다.
- Docker와 배포 자동화는 기존 종합 health 계약을 그대로 사용한다.

### 2단계

- 1단계 운영 검증 이후 별도 PR로만 진행한다.
- Docker 상태 확인은 liveness를 사용한다.
- 신규 이미지와 롤백 이미지의 배포 판정은 readiness를 사용한다.
- 자동 롤백 대상은 probe를 지원하는 1단계 이후 이미지로 제한한다.
- #642 이전 이미지의 401/404를 성공으로 해석하거나 인증을 완화하지 않는다.
