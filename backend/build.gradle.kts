plugins {
    java
    id("org.springframework.boot") version "3.4.1"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "com.duing"
version = "0.0.1-SNAPSHOT"

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

val queryDslVersion = "5.0.0"

dependencies {
    // Spring Boot starters
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-validation")

    // DB
    runtimeOnly("org.postgresql:postgresql")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")

    // QueryDSL (jakarta)
    implementation("com.querydsl:querydsl-jpa:${queryDslVersion}:jakarta")
    annotationProcessor("com.querydsl:querydsl-apt:${queryDslVersion}:jakarta")
    annotationProcessor("jakarta.annotation:jakarta.annotation-api")
    annotationProcessor("jakarta.persistence:jakarta.persistence-api")

    // JWT
    implementation("com.auth0:java-jwt:4.4.0")

    // HTML sanitizer — 공지 본문(HTML 포맷) 서버측 XSS 정제
    implementation("org.jsoup:jsoup:1.18.3")

    // 파일 스토리지
    implementation("software.amazon.awssdk:s3")

    // API 문서
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.7.0")

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

// AWS SDK BOM + TestContainers BOM
dependencyManagement {
    imports {
        mavenBom("software.amazon.awssdk:bom:2.34.0")            // 운영
        mavenBom("org.testcontainers:testcontainers-bom:1.20.4") // 테스트
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
}
