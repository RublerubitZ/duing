plugins {
    java
    id("org.springframework.boot") version "3.5.16"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "com.duing"
version = "0.0.1-SNAPSHOT"

// Boot 3.5.16(3.x 마지막 OSS 패치) BOM 관리 버전 중 GHSA CRITICAL/HIGH 가 남는 것만 같은 패치 라인 안에서 올린다.
// 다음 Boot 상향 때 BOM 관리 버전이 여기 값 이상이 되면 해당 줄을 지운다.
extra["tomcat.version"] = "10.1.60"        // BOM 10.1.55: CVE-2026-68525·65905·65182(CRITICAL). 10.1.58 은 Central 미공개
extra["jackson-bom.version"] = "2.21.7"    // BOM 2.21.4: CVE-2026-68497(HIGH)
extra["postgresql.version"] = "42.7.13"    // BOM 42.7.11: CVE-2026-54291(HIGH)

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

configurations {
    compileOnly {
        extendsFrom(configurations.annotationProcessor.get())
    }
}

repositories {
    mavenCentral()
}

val queryDslVersion = "6.12"

dependencies {
    // Spring Boot starters
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-actuator")

    // DB
    runtimeOnly("org.postgresql:postgresql")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")

    // QueryDSL — OpenFeign 포크. 원본 com.querydsl 은 휴면이고 CVE-2024-49203 수정판이 없다.
    // 6.x 가 Hibernate 6.6·JPA 3.1 줄이다(7.x 는 Hibernate 7 용 — Boot 4 전환 때 함께 올린다).
    // querydsl-core 6.x 의 reactor-core 는 Reactive API 용이라 JPA 경로가 쓰지 않는다 — 런타임·컴파일 어디에도 들이지 않는다.
    implementation("io.github.openfeign.querydsl:querydsl-jpa:${queryDslVersion}") {
        exclude(group = "io.projectreactor", module = "reactor-core")
    }
    annotationProcessor("io.github.openfeign.querydsl:querydsl-apt:${queryDslVersion}:jpa") {
        exclude(group = "io.projectreactor", module = "reactor-core")
    }

    // JWT
    implementation("com.auth0:java-jwt:4.4.0")

    // spring-retry — SchoolFacilityClient 룸 단위 재시도(@Retryable, 총 4회 / 0.5·1·2초 / 5xx·네트워크·타임아웃만).
    // @Retryable 은 AOP 프록시로 동작하므로 spring-boot-starter-aop 가 필요하다. 버전은 Spring Boot BOM 이 관리한다.
    implementation("org.springframework.retry:spring-retry")
    implementation("org.springframework.boot:spring-boot-starter-aop")

    // 공개 API 마이크로 캐시의 엔트리별 TTL·동일 키 miss 병합(PublicApiCacheConfig). 버전은 Spring Boot BOM 이 관리한다.
    implementation("org.springframework.boot:spring-boot-starter-cache")
    implementation("com.github.ben-manes.caffeine:caffeine")

    // HTML sanitizer(공지 본문 서버측 XSS 정제) + 시설 목록 크롤러(SchoolFacilityClient 의 Jsoup.connect).
    // 1.23 의 HTTP 전송은 JDK HttpClient 다(1.18 은 HttpURLConnection) — 크롤이 깨지면 JVM 프로퍼티 -Djsoup.useHttpClient=false 로
    // 되돌린다(운영은 서버 .env 에 JAVA_TOOL_OPTIONS=-Djsoup.useHttpClient=false 를 넣고 백엔드만 재기동, 재빌드 불필요).
    implementation("org.jsoup:jsoup:1.23.2")

    // 파일 스토리지 — 동기 S3Client(apache-client)만 쓰므로 비동기 전용 netty-nio-client(netty 일체)를 뺀다.
    // S3AsyncClient 가 필요해지면 exclude 를 지우고 netty 버전을 관리할 것.
    implementation("software.amazon.awssdk:s3") {
        exclude(group = "software.amazon.awssdk", module = "netty-nio-client")
    }

    // API 문서 — 2.9.x 는 Boot 3.5 기준 빌드. 2.8+ 는 OpenAPI 3.1 로 낸다(운영 프로파일은 비활성).
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.9.1")

    // Sentry — 에러 모니터링 (SENTRY_DSN 없으면 자동 비활성). logback ERROR 레벨을 이벤트로 전송.
    implementation(platform("io.sentry:sentry-bom:8.43.0"))
    implementation("io.sentry:sentry-spring-boot-starter-jakarta")
    implementation("io.sentry:sentry-logback")

    // Lombok
    compileOnly("org.projectlombok:lombok")
    annotationProcessor("org.projectlombok:lombok")
    testCompileOnly("org.projectlombok:lombok")
    testAnnotationProcessor("org.projectlombok:lombok")

    // Test
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.testcontainers:junit-jupiter")
    testImplementation("org.testcontainers:postgresql")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("io.rest-assured:rest-assured")
    testImplementation("com.navercorp.fixturemonkey:fixture-monkey-starter:1.1.7")
    testImplementation("com.navercorp.fixturemonkey:fixture-monkey-jakarta-validation:1.1.7")

    // MinIO Testcontainer — 파일 스토리지 통합 테스트용
    testImplementation("org.testcontainers:minio")

    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

// AWS SDK BOM. Testcontainers 는 Boot 3.5.16 BOM 이 1.21.4 를 관리한다(1.21.4 미만은 Docker 29 에서 컨테이너 기동 실패).
dependencyManagement {
    imports {
        mavenBom("software.amazon.awssdk:bom:2.34.0")
    }
}

// QueryDSL Q-class 출력 경로
val querydslDir = layout.buildDirectory.dir("generated/querydsl")
sourceSets {
    main {
        java.srcDirs(querydslDir)
    }
}
tasks.withType<JavaCompile>().configureEach {
    options.generatedSourceOutputDirectory.set(querydslDir.get().asFile)
}
tasks.named<Delete>("clean") {
    delete(querydslDir)
}

tasks.test {
    useJUnitPlatform()
    // @SpringBootTest 컨텍스트가 늘며 기본 힙(512m)으로는 스위트 후반에 OOM 으로 컨텍스트 로드가
    // 실패한다(예: PrivacyRetentionSchedulingWiringTest). 캐시된 컨텍스트를 수용할 상한을 명시한다.
    maxHeapSize = "2g"
}

// 컨테이너 이미지에는 실행가능한 bootJar 하나만 필요하므로 plain jar 생성을 끈다(build/libs 단일화 → Dockerfile COPY 단순화).
tasks.named("jar") {
    enabled = false
}
