# Liveness·Readiness Health Check 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spring Boot의 생존 상태와 PostgreSQL을 포함한 요청 처리 준비 상태를 분리하고, Docker는 liveness를, 배포 성공·롤백 판정은 readiness를 사용하게 한다.

**Architecture:** Spring Boot Actuator health group에 `livenessState`와 `readinessState,db`를 명시하고 세 health 경로만 공개한다. Docker Compose healthcheck는 liveness를 사용하되 구버전 이미지 롤백 시 정확한 404에만 기존 종합 health로 폴백하고, CD는 timeout이 제한된 readiness polling과 롤백 후 복구 검증을 수행한다.

**Tech Stack:** Java 21, Spring Boot 3.4.1 Actuator, Spring Security, JUnit 5, RestAssured, Testcontainers PostgreSQL, HikariCP, Docker Compose, GitHub Actions, Bash

## Global Constraints

- `GET /actuator/health/liveness`는 `livenessState`만 포함하며 DB와 외부 서비스를 확인하지 않는다.
- `GET /actuator/health/readiness`는 `readinessState,db`만 포함하며 PostgreSQL 장애 시 HTTP 503을 반환한다.
- `management.endpoint.health.probes.enabled=true`를 명시해 Docker Compose·로컬·테스트에서 probe를 활성화한다.
- `/actuator/health`, `/actuator/health/liveness`, `/actuator/health/readiness`만 인증 없이 허용하고 `show-details=never`를 유지한다.
- Docker healthcheck는 liveness를 사용하고 새 경로가 정확히 404인 구버전 이미지에서만 `/actuator/health`로 폴백한다.
- 새 이미지 readiness는 최대 30회, 연결 timeout 2초, 요청 timeout 4초, 실패 간격 5초로 확인한다.
- 롤백 이미지는 최대 20회, 동일한 timeout·간격으로 확인하며 readiness가 정확히 404인 경우에만 기존 health를 사용한다.
- DB 마이그레이션, Caddy active health check, 외부 Uptime Monitor, Kubernetes, Refresh Token은 추가하지 않는다.
- 모든 변경과 테스트·커밋은 `/private/tmp/duing-worktrees/feat-642-health-check-probes`에서만 수행한다.
- 커밋 메시지는 한국어 `[#642] 작업 내용` 형식을 사용한다.

## File Map

- `backend/src/main/resources/application.yml`: Actuator probe 활성화, liveness/readiness group 구성, 공개 범위 주석을 관리한다.
- `backend/src/main/java/com/duing/global/config/SecurityConfig.java`: 세 health endpoint의 익명 접근만 정확히 허용한다.
- `backend/src/test/java/com/duing/global/ActuatorHealthAcceptanceTest.java`: 정상 상태의 세 endpoint 계약과 상세정보 비노출, 임의 하위 경로 차단을 검증한다.
- `backend/src/test/java/com/duing/global/ActuatorDatabaseOutageAcceptanceTest.java`: 기동 후 DataSource 사용 불가 상태에서 liveness와 readiness가 분리되는지 검증한다.
- `deploy/docker-compose.yml`: 컨테이너 liveness 상태와 구버전 이미지 폴백을 정의한다.
- `.github/workflows/deploy-backend.yml`: 새 이미지 readiness gate와 롤백 이미지 복구 확인을 수행한다.
- `backend/README.md`: 개발자가 사용할 세 health endpoint의 의미를 설명한다.
- `deploy/README.md`: 운영자가 Docker 상태와 배포 readiness를 해석하는 방법을 설명한다.

---

### Task 1: Actuator probe 계약과 보안 경로

**Files:**
- Modify: `backend/src/test/java/com/duing/global/ActuatorHealthAcceptanceTest.java:1-49`
- Create: `backend/src/test/java/com/duing/global/ActuatorDatabaseOutageAcceptanceTest.java`
- Modify: `backend/src/main/resources/application.yml:30-46`
- Modify: `backend/src/main/java/com/duing/global/config/SecurityConfig.java:131-134`

**Interfaces:**
- Consumes: Spring Boot Actuator의 `livenessState`, `readinessState`, `db` health contributor 이름
- Produces: 공개 GET endpoint `/actuator/health`, `/actuator/health/liveness`, `/actuator/health/readiness`

- [ ] **Step 1: 정상·보안 계약을 나타내는 실패 테스트 작성**

`ActuatorHealthAcceptanceTest`의 기존 두 테스트를 아래 세 테스트로 교체하고 다음 import를 추가한다.

```java
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
```

```java
@ParameterizedTest(name = "{0}은 인증 없이 정상 상태를 반환한다")
@ValueSource(strings = {
        "/actuator/health",
        "/actuator/health/liveness",
        "/actuator/health/readiness"
})
@DisplayName("공개 health endpoint는 인증 없이 200과 UP을 반환한다")
void anonymousCanCheckPublicHealthEndpoints(String endpoint) {
    RestAssured.given()
            .when()
                .get(endpoint)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("status", equalTo("UP"));
}

@ParameterizedTest(name = "{0}은 내부 상태를 노출하지 않는다")
@ValueSource(strings = {
        "/actuator/health",
        "/actuator/health/liveness",
        "/actuator/health/readiness"
})
@DisplayName("공개 health endpoint는 내부 component와 상세 정보를 노출하지 않는다")
void publicHealthEndpointsHideComponentDetails(String endpoint) {
    RestAssured.given()
            .when()
                .get(endpoint)
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("components", nullValue())
                .body("details", nullValue());
}

@Test
@DisplayName("명시적으로 공개하지 않은 health 하위 경로는 인증을 요구한다")
void undocumentedHealthSubpathRequiresAuthentication() {
    RestAssured.given()
            .when()
                .get("/actuator/health/db")
            .then()
                .statusCode(HttpStatus.UNAUTHORIZED.value());
}
```

- [ ] **Step 2: 테스트가 현재 구현에서 실패하는지 확인**

Run:

```bash
cd backend
./gradlew test --tests "com.duing.global.ActuatorHealthAcceptanceTest"
```

Expected: `/actuator/health/liveness` 또는 `/actuator/health/readiness`가 익명 요청에서 200을 반환하지 않아 FAIL.

- [ ] **Step 3: DB 사용 불가 상태의 실패 테스트 작성**

다음 테스트 클래스를 생성한다. Hikari DataSource 종료는 실제 네트워크 hang이 아니라 readiness group의 DB 실패
전파를 검증하기 위한 재현임을 코드에 명시한다.

```java
package com.duing.global;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.TestcontainersConfiguration;
import com.zaxxer.hikari.HikariDataSource;
import io.restassured.RestAssured;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.annotation.DirtiesContext;

import javax.sql.DataSource;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ActuatorDatabaseOutageAcceptanceTest {

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("DB를 사용할 수 없어도 liveness는 유지되고 readiness만 상세 정보 없이 실패한다")
    void databaseOutageOnlyFailsReadiness() {
        assertThat(dataSource).isInstanceOf(HikariDataSource.class);
        // 실제 네트워크 timeout이 아니라 db indicator의 실패가 readiness에만 반영되는지 검증한다.
        ((HikariDataSource) dataSource).close();

        RestAssured.given()
                .when()
                    .get("/actuator/health/readiness")
                .then()
                    .statusCode(HttpStatus.SERVICE_UNAVAILABLE.value())
                    .body("status", equalTo("DOWN"))
                    .body("components", nullValue())
                    .body("details", nullValue());

        RestAssured.given()
                .when()
                    .get("/actuator/health/liveness")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("status", equalTo("UP"))
                    .body("components", nullValue())
                    .body("details", nullValue());
    }
}
```

- [ ] **Step 4: DB 장애 테스트도 현재 구현에서 실패하는지 확인**

Run:

```bash
cd backend
./gradlew test --tests "com.duing.global.ActuatorDatabaseOutageAcceptanceTest"
```

Expected: readiness endpoint가 아직 활성화·공개되지 않아 HTTP 503/DOWN 계약을 만족하지 못하고 FAIL.

- [ ] **Step 5: Actuator probe와 group을 최소 설정으로 활성화**

`application.yml`의 management 설정을 다음과 같이 변경한다.

```yaml
# Actuator — 종합 health와 liveness/readiness probe만 외부에 노출한다.
# info·metrics·env·beans 등 다른 endpoint는 web exposure에서 제외하고, 공개 health 응답은
# show-details=never로 DB·디스크·오류 메시지 등 내부 상태를 숨긴다.
management:
  endpoints:
    web:
      exposure:
        include: health
  endpoint:
    health:
      show-details: never
      probes:
        enabled: true
      group:
        liveness:
          include: "livenessState"
        readiness:
          include: "readinessState,db"
  health:
    mail:
      # spring-boot-starter-mail 제거(PR5) 후 이 키는 무해한 잔존 설정이다. 굳이 지우지 않는 이유:
      # 구 이미지로 롤백하면 JavaMailSender 헬스체크가 되살아나 배포가 롤백 루프에 빠진 전례가 있다.
      enabled: false
```

- [ ] **Step 6: Spring Security에 세 공개 경로를 정확히 명시**

`SecurityConfig`의 actuator matcher를 와일드카드 없이 다음처럼 변경한다.

```java
.requestMatchers(
        "/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**",
        "/actuator/health",
        "/actuator/health/liveness",
        "/actuator/health/readiness",
        "/files/**"
).permitAll()
```

- [ ] **Step 7: 정상·DB 장애·보안 계약 테스트 통과 확인**

Run:

```bash
cd backend
./gradlew test --tests "com.duing.global.ActuatorHealthAcceptanceTest" \
  --tests "com.duing.global.ActuatorDatabaseOutageAcceptanceTest" \
  --tests "com.duing.global.config.SecurityResponseHeadersTest"
```

Expected: `BUILD SUCCESSFUL`; 정상 상태의 세 endpoint는 200, DB 사용 불가 상태는 readiness만 503이며
`/actuator/health/db`는 401.

- [ ] **Step 8: Task 1 커밋**

```bash
git add backend/src/main/resources/application.yml \
  backend/src/main/java/com/duing/global/config/SecurityConfig.java \
  backend/src/test/java/com/duing/global/ActuatorHealthAcceptanceTest.java \
  backend/src/test/java/com/duing/global/ActuatorDatabaseOutageAcceptanceTest.java
git diff --cached --check
git commit -m "[#642] Liveness와 Readiness 엔드포인트 분리"
```

---

### Task 2: Docker liveness와 구버전 롤백 호환성

**Files:**
- Modify: `deploy/docker-compose.yml:17-24`

**Interfaces:**
- Consumes: Task 1의 `/actuator/health/liveness`와 구버전의 `/actuator/health`
- Produces: Docker `healthy`/`unhealthy` 상태; 정확한 HTTP 404에서만 동작하는 legacy fallback

- [ ] **Step 1: 현재 Compose가 아직 종합 health를 사용하는지 확인**

Run:

```bash
docker compose -f deploy/docker-compose.yml config --no-interpolate \
  | sed -n '/healthcheck:/,/image:/p'
```

Expected: healthcheck 출력에 `/actuator/health`만 존재하고 `/actuator/health/liveness`는 없어 새 계약을 만족하지 못함.

- [ ] **Step 2: liveness 우선·404 전용 폴백 healthcheck 구현**

`deploy/docker-compose.yml`의 healthcheck를 다음 내용으로 교체한다. Compose가 컨테이너 shell에 `$status`를 전달하도록 `$`를 `$$`로 escape한다.

```yaml
healthcheck:
  # docker compose ps에서 프로세스 생존 상태를 확인한다. 최초 전환 배포에서 구버전 이미지로
  # 롤백하면 새 경로가 없으므로, 정확히 404일 때만 기존 종합 health로 폴백한다.
  test:
    - CMD-SHELL
    - >-
      status=$$(curl --silent --output /dev/null --write-out '%{http_code}'
      --connect-timeout 2 --max-time 4
      http://localhost:8080/actuator/health/liveness || true);
      if [ "$$status" = "404" ]; then
        curl --fail --silent --show-error --connect-timeout 2 --max-time 4
        http://localhost:8080/actuator/health > /dev/null;
      else
        [ "$$status" = "200" ];
      fi
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 90s
```

- [ ] **Step 3: Compose 렌더링 결과 검증**

Run:

```bash
docker compose -f deploy/docker-compose.yml config --no-interpolate > /tmp/duing-compose-rendered.yml
rg -n "CMD-SHELL|health/liveness|status.*404|health > /dev/null|start_period: 90s" \
  /tmp/duing-compose-rendered.yml
```

Expected: `docker compose config` exit 0; 렌더링 결과에 liveness, 404 비교, legacy health, 기존 interval/timeout/retry/start period가 모두 존재.

- [ ] **Step 4: Task 2 커밋**

```bash
git add deploy/docker-compose.yml
git diff --cached --check
git commit -m "[#642] Docker Health Check를 Liveness 기준으로 전환"
```

---

### Task 3: 배포 readiness gate와 롤백 복구 확인

**Files:**
- Modify: `.github/workflows/deploy-backend.yml:124-153`

**Interfaces:**
- Consumes: 실행 중인 `backend` Compose service와 `/actuator/health/readiness`; 구버전 `/actuator/health`
- Produces: `probe_backend(path) -> HTTP status text`; `wait_for_backend(max_attempts, allow_legacy) -> shell success/failure`

- [ ] **Step 1: 현재 배포 판정이 Docker health 상태만 사용하는지 확인**

Run:

```bash
rg -n "docker inspect|State.Health.Status|actuator/health/readiness|for attempt" \
  .github/workflows/deploy-backend.yml
```

Expected: `docker inspect` 기반 20회 polling은 존재하고 readiness endpoint 호출은 없음.

- [ ] **Step 2: timeout이 제한된 readiness 함수 구현**

`docker compose up -d` 다음의 기존 Docker health polling과 롤백 블록 전체를 아래 코드로 교체한다.

```bash
probe_backend() {
  local path="$1"
  docker compose exec -T backend \
    curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
      --connect-timeout 2 --max-time 4 "http://localhost:8080${path}" \
    || true
}

wait_for_backend() {
  local max_attempts="$1"
  local allow_legacy="$2"
  local attempt path status

  for attempt in $(seq 1 "$max_attempts"); do
    path="/actuator/health/readiness"
    status="$(probe_backend "$path")"

    if [ "$status" = "404" ] && [ "$allow_legacy" = "true" ]; then
      path="/actuator/health"
      status="$(probe_backend "$path")"
    fi

    echo "backend readiness: ${status:-unreachable} via ${path} (${attempt}/${max_attempts})"
    if [ "$status" = "200" ]; then
      return 0
    fi
    if [ "$attempt" -lt "$max_attempts" ]; then
      sleep 5
    fi
  done
  return 1
}

if wait_for_backend 30 false; then
  docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile \
    || { echo "caddy reload 실패 — caddy 재시작"; docker compose restart caddy; }
  docker image prune -f || true
  echo "배포 완료: ${DEPLOY_IMAGE}"
  exit 0
fi

echo "::error::backend readiness 확인 실패 — 직전 이미지로 롤백: ${PREV_IMAGE:-(이전 값 없음)}"
if [ -n "$PREV_IMAGE" ] && [ "$PREV_IMAGE" != "$DEPLOY_IMAGE" ]; then
  sed -i "s|^BACKEND_IMAGE=.*|BACKEND_IMAGE=${PREV_IMAGE}|" .env
  docker compose pull backend || true
  docker compose up -d || true

  if wait_for_backend 20 true; then
    echo "::warning::직전 이미지로 복구 완료: ${PREV_IMAGE}"
  else
    echo "::error::직전 이미지도 health 확인에 실패했습니다 — 수동 복구가 필요합니다: ${PREV_IMAGE}"
  fi
else
  echo "::error::복구 가능한 직전 이미지가 없습니다 — 수동 복구가 필요합니다."
fi
exit 1
```

새 이미지 확인에서는 `allow_legacy=false`이므로 readiness가 누락된 이미지를 성공 처리하지 않는다. 30회 모두
요청 timeout에 도달할 때 최악 시간은 `30×4 + 29×5 = 265초`다. 롤백 확인에서는
`allow_legacy=true`이므로 readiness가 정확히 404인 구버전 이미지에만 종합 health를 사용한다. 20회 최악
시간은 `20×4 + 19×5 = 175초`다.

- [ ] **Step 3: 워크플로 YAML과 핵심 불변식 정적 검증**

Run:

```bash
ruby -e 'require "yaml"; YAML.load_file(ARGV.fetch(0)); puts "yaml-ok"' \
  .github/workflows/deploy-backend.yml
rg -n "connect-timeout 2|max-time 4|wait_for_backend 30 false|wait_for_backend 20 true|status.*404|수동 복구" \
  .github/workflows/deploy-backend.yml
```

Expected: `yaml-ok`; 신규 배포는 30회/no legacy, 롤백은 20회/legacy 허용, 2초·4초 timeout과 404 분기가 모두 검색됨.

- [ ] **Step 4: Task 3 커밋**

```bash
git add .github/workflows/deploy-backend.yml
git diff --cached --check
git commit -m "[#642] 배포 Readiness 확인과 롤백 검증 강화"
```

---

### Task 4: 운영 문서와 전체 회귀 검증

**Files:**
- Modify: `backend/README.md:82`
- Modify: `deploy/README.md:80-91`

**Interfaces:**
- Consumes: Tasks 1-3에서 확정한 endpoint와 운영 timeout 계약
- Produces: 개발·운영자가 사용할 health endpoint 및 장애 해석 문서

- [ ] **Step 1: 백엔드 로컬 실행 문서에 세 endpoint 추가**

`backend/README.md`의 단일 health 링크를 다음 목록으로 교체한다.

```markdown
- 종합 헬스: <http://localhost:8080/actuator/health> — 기존 호환용이며 DB 상태를 포함한다.
- Liveness: <http://localhost:8080/actuator/health/liveness> — JVM·HTTP 서버 생존 상태만 확인한다.
- Readiness: <http://localhost:8080/actuator/health/readiness> — 요청 처리 준비 상태와 DB 연결을 확인한다.
```

- [ ] **Step 2: 운영 배포 문서에 판정 의미와 수동 확인 방법 추가**

`deploy/README.md`의 실행/업데이트 명령 다음에 아래 내용을 추가한다.

```markdown
## Health Check 운영 기준

- Docker `healthcheck`는 liveness를 사용한다. `docker compose ps`의 `healthy`는 JVM과 HTTP 서버가
  응답한다는 의미이며 DB 정상 여부를 보장하지 않는다.
- 자동 배포는 readiness를 최대 30회 확인하고 DB 연결까지 정상일 때만 성공 처리한다. 각 요청은 연결 2초,
  전체 4초 timeout을 사용하고 실패 사이에 5초 대기한다.
- DB 장애에서는 liveness가 `UP`이어도 readiness가 `DOWN`과 HTTP 503을 반환할 수 있다.
- 롤백 후에도 최대 20회 health를 확인한다. 새 readiness 경로가 정확히 404인 구버전 이미지에서만 기존
  `/actuator/health`로 확인한다.

```bash
curl -fsS https://api.duings.com/actuator/health/liveness
curl -fsS https://api.duings.com/actuator/health/readiness
docker compose ps
```

공개 응답은 `show-details=never`이므로 DB 주소·오류 메시지·component 상세를 노출하지 않는다.
```

- [ ] **Step 3: Health Check 집중 테스트 실행**

Run:

```bash
cd backend
./gradlew test \
  --tests "com.duing.global.ActuatorHealthAcceptanceTest" \
  --tests "com.duing.global.ActuatorDatabaseOutageAcceptanceTest" \
  --tests "com.duing.global.config.SecurityResponseHeadersTest"
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: 백엔드 전체 회귀 테스트와 빌드 실행**

Run:

```bash
cd backend
./gradlew test
./gradlew build -x test
```

Expected: 두 명령 모두 `BUILD SUCCESSFUL`.

- [ ] **Step 5: 배포 설정과 변경 품질 최종 검증**

Run:

```bash
docker compose -f deploy/docker-compose.yml config --no-interpolate > /tmp/duing-compose-rendered.yml
ruby -e 'require "yaml"; YAML.load_file(ARGV.fetch(0)); puts "yaml-ok"' \
  .github/workflows/deploy-backend.yml
git diff --check
git diff --check origin/develop...HEAD
git status --short --branch
```

Expected: Compose exit 0, `yaml-ok`, diff 오류 없음, Health Check Worktree에 의도한 변경만 존재.

- [ ] **Step 6: Task 4 커밋**

```bash
git add backend/README.md deploy/README.md
git diff --cached --check
git commit -m "[#642] Health Check 운영 문서 보완"
```

- [ ] **Step 7: 커밋 이후 최종 상태 재검증**

Run:

```bash
git status --short --branch
git log --oneline origin/develop..HEAD
```

Expected: working tree clean; 설계·계획과 Tasks 1-4의 `[#642]` 커밋만 표시됨.
