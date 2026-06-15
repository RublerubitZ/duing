# syntax=docker/dockerfile:1

# ── 빌드 스테이지 — JDK 21 로 실행가능 bootJar 생성 ──────────────────────
FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace

# 빌드 스크립트/래퍼 + 소스 복사. Gradle 의존성은 BuildKit 캐시 마운트로 재사용한다.
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
COPY src ./src

# 테스트는 CI(backend-ci.yml)에서 수행하므로 이미지 빌드에서는 제외한다
# (TestContainers 가 Docker-in-Docker 를 요구해 이미지 빌드 단계에 부적합).
RUN --mount=type=cache,target=/root/.gradle \
    chmod +x gradlew && ./gradlew bootJar --no-daemon -x test

# ── 런타임 스테이지 — JRE 21, 비루트 ───────────────────────────────────
FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app

# 컨테이너 헬스체크용 curl + 비루트 실행 사용자
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system duing \
    && useradd --system --gid duing --home /app duing

# plain jar 는 비활성(build.gradle.kts)이라 build/libs 에는 bootJar 하나만 존재한다.
COPY --from=build /workspace/build/libs/*.jar app.jar
USER duing

EXPOSE 8080
ENV SPRING_PROFILES_ACTIVE=prod \
    JAVA_OPTS="-XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"

# exec 로 java 를 PID 1 로 띄워 SIGTERM 을 직접 받게 한다 — 컨테이너 종료/재배포 시
# Spring 컨텍스트가 정상 종료(데이터소스 등 정리)된다.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
