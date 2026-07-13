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
endpoint는 호환성을 위해 유지하되 Docker와 배포 자동화는 새 endpoint를 사용한다.

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
배포 readiness 확인이 시간 초과되어 실패한다.

### 3.3 기존 종합 Health

`GET /actuator/health`는 기존 운영 도구와 문서의 하위 호환성을 위해 유지한다. 종합 상태이므로 DB 장애 시
503이 될 수 있으며, Docker 생존 판정이나 새 배포 성공 판정에는 사용하지 않는다.

## 4. 보안과 정보 노출

- `/actuator/health`, `/actuator/health/liveness`, `/actuator/health/readiness` 세 경로만 인증 없이 허용한다.
- actuator의 다른 endpoint와 임의의 health 하위 경로는 공개하지 않는다.
- `show-details=never`를 유지해 component 이름, DB 종류·주소, 오류 메시지, 디스크 상태를 응답에 노출하지 않는다.
- health endpoint는 상태 확인만 수행하며 데이터 변경이나 시크릿 로그 출력을 하지 않는다.

## 5. 운영 판정 흐름

### 5.1 Docker Compose

컨테이너 `healthcheck`는 `/actuator/health/liveness`를 호출한다. 이 변경이 처음 배포될 때 이전 이미지로
롤백할 수 있도록, liveness 응답이 정확히 404인 경우에만 기존 `/actuator/health`로 폴백한다. 연결 실패나
503 등 실제 liveness 실패에서는 종합 health로 폴백하지 않는다.

`restart: unless-stopped`는 Docker의 `unhealthy` 상태만으로 컨테이너를 자동 재시작하지 않는다. 이 신호는
운영자가 `docker compose ps`로 프로세스 생존 상태를 확인하고 향후 모니터가 소비할 수 있는 가시성 정보다.

기존 30초 간격, 5초 타임아웃, 3회 재시도, 90초 start period는 유지한다. 이번 작업에서 재시작 감시
프로세스나 Kubernetes를 추가하지 않는다.

### 5.2 배포 성공과 롤백

배포 워크플로는 Docker의 liveness 기반 `healthy` 값만 기다리지 않는다. 새 컨테이너 내부에서 다음 조건으로
`/actuator/health/readiness`를 재시도한다.

- 최대 30회 호출
- 연결 수립 제한 `curl --connect-timeout 2`
- 요청 전체 제한 `curl --max-time 4`
- 실패한 호출 사이 5초 대기
- 최악 실행 시간: `30회 × 4초 + 29회 × 5초 = 265초`

HTTP 503처럼 즉시 실패하면 실제 대기 시간은 약 145초이고, DB 연결이 hang 상태여도 배포 클라이언트의 한
호출은 4초를 넘지 않는다. 서버 내부 `DataSourceHealthIndicator`가 Hikari connection timeout까지 처리 중일
수는 있지만, 배포 스크립트의 단일 호출과 전체 롤백 예산은 이에 종속되지 않는다. 265초 상한은 Docker의
90초 start period보다 175초 길어 Flyway 실행과 초기 connection pool 준비 시간을 확보하며, 워크플로의
20분 timeout 안에 롤백 검증까지 수행할 수 있다.

- readiness 200: 새 이미지 배포 성공
- readiness가 제한 시간 동안 503 또는 연결 실패: 기존 이미지로 롤백
- 롤백 시 기존 `BACKEND_IMAGE` 복원 동작은 유지

따라서 프로세스만 떴지만 DB 연결이나 Flyway 검증이 실패한 이미지는 배포 성공으로 처리되지 않는다.

롤백 후에는 최대 20회, 동일한 연결 2초·요청 4초 timeout과 5초 간격으로 복구 상태를 확인한다. 이전 이미지가
readiness endpoint를 제공하면 해당 endpoint를 사용하고, 정확히 404인 경우에만 기존 `/actuator/health`를
사용한다. 최악 검증 시간은 `20회 × 4초 + 19회 × 5초 = 175초`다. 롤백 이미지도 정상 endpoint를 반환하지
못하면 배포 잡은 실패 상태를 유지하고 수동 복구가 필요하다는 오류를 출력한다.

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

### 7.3 설정과 배포 검증

- Spring Security가 정확한 세 health 경로만 공개하는지 검증한다.
- `docker compose config`로 Compose 문법과 liveness 경로를 검증한다.
- 배포 스크립트가 readiness를 성공 조건으로 사용하는지 정적 검증한다.
- 백엔드 전체 테스트와 배포 설정 검증을 실행한다.

## 8. 롤백 전략

DB 마이그레이션과 API 비즈니스 계약 변경은 없다. 문제가 발생하면 `BACKEND_IMAGE`를 이전 이미지로
롤백한다. 서버에 동기화된 새 Compose와 배포 스크립트는 자동으로 이전 버전으로 복구되지 않으므로, 이번
변경은 새 probe endpoint가 404인 경우에만 기존 `/actuator/health`를 사용하는 전환 호환성을 제공한다.

설정만 일부 롤백해 Docker와 배포 워크플로가 서로 다른 endpoint 의미를 사용하지 않도록, 백엔드 설정·Compose·
배포 워크플로 변경은 하나의 PR과 배포 단위로 관리한다.

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
- Docker 상태 확인은 liveness를 사용한다.
- 배포 성공·롤백 판정은 readiness를 사용한다.
- 공개 health 응답에 내부 component와 상세 오류가 노출되지 않는다.
- 기존 `/actuator/health` 호출은 깨지지 않는다.
