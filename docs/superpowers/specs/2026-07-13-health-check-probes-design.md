# Liveness·Readiness Health Check 분리 설계

- 작성일: 2026-07-13
- 대상: `backend`, `deploy`
- 목적: 애플리케이션 생존 상태와 DB를 포함한 요청 처리 준비 상태를 분리해 배포·장애 판정을 정확하게 한다.

## 1. 배경

현재 백엔드는 공개된 `/actuator/health` 하나를 Docker 컨테이너 상태와 배포 성공 판정에 함께 사용한다.
Spring Boot의 기본 종합 health에는 DB 상태가 포함되므로, 애플리케이션 프로세스가 정상이어도 DB가 일시적으로
중단되면 같은 endpoint가 실패한다. 이 구조에서는 다음 상태를 구분하기 어렵다.

- JVM과 HTTP 서버 자체가 응답하지 못하는 프로세스 장애
- JVM은 정상이지만 PostgreSQL 연결이 끊겨 요청을 처리할 수 없는 의존성 장애
- 새 버전이 기동은 됐지만 DB 연결을 포함한 서비스 준비가 끝나지 않은 배포 실패

단일 Lightsail 인스턴스와 Docker Compose를 유지하면서도 각 신호의 의미를 분리해야 한다.

## 2. 검토한 접근

### A. 기존 `/actuator/health` 유지

변경 비용은 없지만 DB 장애와 프로세스 장애를 계속 구분하지 못한다. 배포 자동화와 향후 외부 모니터링이
동일한 모호한 신호에 의존하므로 채택하지 않는다.

### B. 전용 Controller와 JDBC 쿼리 직접 구현

응답과 타임아웃을 세밀하게 제어할 수 있지만 Spring Boot Actuator의 lifecycle 상태와 표준
`DataSourceHealthIndicator`를 중복 구현하게 된다. 유지보수할 코드와 보안 검토 범위가 불필요하게 늘어나므로
채택하지 않는다.

### C. Spring Boot Actuator health group 사용 — 채택

Actuator probe를 활성화하고 liveness와 readiness group의 구성 요소를 명시한다. Spring Boot가 제공하는
`livenessState`, `readinessState`, `db` indicator를 사용하므로 변경이 작고 의미가 표준적이다. 기존 종합
endpoint는 호환성을 위해 유지한다. 운영 전환은 probe를 먼저 배포한 뒤 Docker와 배포 자동화가 새 endpoint를
사용하도록 바꾸는 2단계로 수행한다.

## 3. Endpoint 계약

Docker Compose는 Kubernetes 환경이 아니므로 probe group이 자동 활성화되지 않는다. 다음 설정을 명시해
endpoint 활성화와 group 구성 요소를 운영·로컬·테스트에서 동일하게 고정한다.

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
```

### 3.1 Liveness

- 경로: `GET /actuator/health/liveness`
- 포함 indicator: `livenessState`만 포함
- 정상: HTTP 200, `{"status":"UP"}`
- 비정상: HTTP 503
- DB, R2, Bank API, Octomo, Sentry 등 외부 의존성 상태는 포함하지 않는다.

DB가 일시 중단되어도 JVM과 HTTP 서버가 요청에 응답할 수 있으면 liveness는 `UP`을 유지한다. 의존성 장애로
프로세스를 재시작하는 잘못된 복구 동작을 피하기 위함이다.

### 3.2 Readiness

- 경로: `GET /actuator/health/readiness`
- 포함 indicator: `readinessState`, `db`
- 두 indicator가 모두 정상: HTTP 200, `{"status":"UP"}`
- PostgreSQL 연결 실패 또는 준비 상태 거부: HTTP 503, `{"status":"DOWN"}` 또는 대응 상태
- R2와 외부 API는 포함하지 않는다. 해당 기능의 부분 장애가 전체 API 트래픽 차단으로 전파되는 것을 막는다.

애플리케이션 기동 이후 PostgreSQL 연결이 끊기면 liveness는 200을 유지하고 readiness만 503을 반환해야 한다.
Flyway 검증 실패처럼 ApplicationContext 자체가 기동하지 못하는 경우에는 두 endpoint 모두 열리지 않으며,
2단계의 배포 readiness 확인이 시간 초과되어 실패한다.

### 3.3 기존 종합 Health

`GET /actuator/health`는 기존 운영 도구와 문서의 하위 호환성을 위해 유지한다. 종합 상태이므로 DB 장애 시
503이 될 수 있다. 1단계에서는 운영 중인 #642 이전 이미지와의 롤백 호환성을 위해 Docker와 배포 자동화가
계속 이 endpoint를 사용한다. 2단계부터 liveness와 readiness로 역할을 분리한다.

## 4. 보안과 정보 노출

- `/actuator/health`, `/actuator/health/liveness`, `/actuator/health/readiness` 세 경로만 인증 없이 허용한다.
- actuator의 다른 endpoint와 임의의 health 하위 경로는 공개하지 않는다.
- `show-details=never`를 유지해 component 이름, DB 종류·주소, 오류 메시지, 디스크 상태를 응답에 노출하지 않는다.
- health endpoint는 상태 확인만 수행하며 데이터 변경이나 시크릿 로그 출력을 하지 않는다.

## 5. 운영 전환 흐름

### 5.1 1단계 — Probe 제공

이 PR은 백엔드에 liveness와 readiness endpoint를 추가하고 공개 범위와 응답 계약을 테스트로 고정한다.
운영에 이미 실행 중인 #642 이전 이미지는 새 probe 경로를 익명 요청에 대해 401로 응답한다. 따라서 이 단계에서는
`deploy/docker-compose.yml`과 `.github/workflows/deploy-backend.yml`을 변경하지 않고 기존 종합 health 기반
판정을 유지한다. 새 이미지 기동 실패 시 이전 이미지와 기존 Compose 조합으로 즉시 롤백할 수 있다.

1단계를 운영에 배포한 뒤 다음 스모크 테스트를 모두 통과해야 2단계에 착수한다.

- `/actuator/health`, `/actuator/health/liveness`, `/actuator/health/readiness`가 인증 없이 예상 상태를 반환한다.
- 정상 DB 상태에서 세 endpoint가 모두 200을 반환한다.
- 공개 응답에 `components`와 `details`가 노출되지 않는다.
- 기존 Docker healthcheck와 배포 롤백이 종합 health로 정상 동작한다.

### 5.2 2단계 — 운영 판정 전환

1단계 이미지가 운영에 안정적으로 반영된 뒤, 최신 `develop`에서 별도 브랜치와 PR로 다음 변경을 수행한다.

- Docker healthcheck를 liveness로 전환한다.
- 새 이미지의 배포 성공 판정과 롤백 후 복구 확인을 readiness로 전환한다.
- curl 연결·요청 timeout, 재시도 횟수, 전체 SSH/job 시간 예산을 구현과 함께 다시 검증한다.

2단계에서 선택 가능한 롤백 이미지는 모두 1단계 probe 계약을 지원해야 한다. #642 이전 이미지를 자동 호환 대상으로
간주하지 않으며, 잘못 선택되면 401/404를 성공으로 해석하거나 인증을 완화하지 않고 명시적으로 실패해 수동 복구를
요구한다. 이 조건 덕분에 상태 코드 폴백이 보안 설정 회귀나 잘못된 이미지를 숨기지 않는다.

### 5.3 Caddy와 외부 모니터링

Caddy는 단일 upstream 구성이므로 active health check를 추가하지 않는다. readiness 장애 때 upstream을
제거하면 대체 인스턴스가 없는 상태에서 전체 요청이 즉시 차단되기 때문이다.

외부 Uptime Monitor, Slack·Discord·PagerDuty 알림은 다음 감사 작업으로 분리한다. 후속 모니터링은
liveness, readiness와 실제 핵심 API를 서로 다른 신호로 사용할 수 있다.

## 6. 환경별 지원

- 운영: `https://api.duings.com/actuator/health/...`에서 TLS를 통해 확인한다.
- 로컬: `http://localhost:8080/actuator/health/...`에서 동일한 계약을 지원한다.
- 테스트: Testcontainers PostgreSQL을 사용해 정상 및 연결 장애 상태를 검증한다.

환경별로 indicator 구성을 다르게 두지 않는다. 운영과 테스트의 의미 차이로 인한 회귀를 방지한다.

## 7. 테스트 전략

### 7.1 정상 상태 인수 테스트

- 인증 없이 liveness를 조회하면 200과 `UP`을 반환한다.
- 인증 없이 readiness를 조회하면 Testcontainers DB 연결 상태에서 200과 `UP`을 반환한다.
- 기존 `/actuator/health`는 계속 200을 반환한다.
- 기존 종합 endpoint뿐 아니라 liveness와 readiness group 응답도 각각 `components`와 `details`를 노출하지
  않는다. group별 `show-details` override가 추가되는 회귀를 함께 차단한다.

### 7.2 DB 장애 인수 테스트

별도 Spring context에서 Hikari DataSource를 명시적으로 종료해 기동 후 DB 사용 불가 상태를 재현한다. 이는
실제 네트워크 단절이 아니라 connection pool 폐기에 가까우므로 네트워크 timeout 동작을 검증하려는 테스트는
아니다. readiness group이 `db` indicator의 실패를 반영하면서 liveness와 독립적인지 검증하는 것이 목적이다.
해당 context는 테스트 종료 후 폐기해 다른 테스트에 영향을 주지 않는다.

- readiness는 503과 비정상 상태를 반환한다.
- 같은 시점의 liveness는 200과 `UP`을 유지한다.
- 장애 상태의 readiness 응답도 `components`와 `details`를 노출하지 않는다.

### 7.3 설정과 단계별 배포 검증

- Spring Security가 정확한 세 health 경로만 공개하는지 검증한다.
- 1단계에서는 Compose와 배포 워크플로가 기준 커밋의 종합 health 계약을 그대로 유지하는지 확인한다.
- 1단계 운영 반영 후 세 endpoint를 직접 호출해 응답 상태와 정보 비노출을 확인한다.
- 2단계 PR에서 Compose 문법, liveness 경로, readiness 배포 판정과 timeout 예산을 별도로 검증한다.
- 백엔드 전체 테스트와 변경 품질 검증을 실행한다.

## 8. 롤백 전략

DB 마이그레이션과 API 비즈니스 계약 변경은 없다. 문제가 발생하면 `BACKEND_IMAGE`를 이전 이미지로
롤백한다. 1단계는 Compose와 배포 워크플로를 변경하지 않으므로 #642 이전 이미지로 롤백해도 기존 종합 health
계약이 유지된다.

2단계는 1단계가 운영에 반영된 뒤 별도 PR로 배포하며, 롤백 대상도 1단계 이후 이미지로 제한한다. #642 이전
이미지로의 자동 폴백은 제공하지 않는다. 운영자가 그보다 오래된 이미지를 선택하면 배포를 실패시키고 Compose와
배포 설정을 함께 수동 복구한다.

## 9. 제외 범위

- 외부 Uptime Monitor 및 Slack·Discord·PagerDuty 알림
- Prometheus·Grafana·Loki 구성
- Kubernetes probe 설정
- R2, Bank API, Octomo 등 외부 서비스 HealthIndicator
- 자동 재시작 감시 프로세스 추가
- DB connection pool과 query timeout 튜닝
- Refresh Token 및 인증 구조 변경

## 10. 성공 조건

- 정상 상태에서 liveness와 readiness가 모두 200이다.
- 기동 후 DB 연결 장애에서 liveness는 200, readiness는 503이다.
- 공개 health 응답에 내부 component와 상세 오류가 노출되지 않는다.
- 기존 `/actuator/health` 호출은 깨지지 않는다.
- 1단계 PR은 Docker와 배포 자동화의 기존 종합 health 판정을 변경하지 않는다.
- 1단계 운영 스모크 테스트를 통과한 뒤에만 별도 2단계 PR에서 Docker liveness와 배포 readiness로 전환한다.
- 2단계 롤백 대상은 probe 계약을 지원하는 1단계 이후 이미지로 제한한다.
