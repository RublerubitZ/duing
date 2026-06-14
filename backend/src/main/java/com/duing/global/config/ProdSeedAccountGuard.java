package com.duing.global.config;

import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 운영(prod) 부팅 시 dev 시드 오염을 잡는 심층방어 안전망.
 *
 * <p>1차 통제는 application-prod.yml 의 flyway.locations 분리(classpath:db/migration 만)다. 본 가드는
 * 운영 프로파일이 명시적으로 활성인 상태에서 그 통제가 깨진 경우 — (1) flyway.locations 에 dev 시드
 * (migration-dev)가 섞였거나 (2) known-credential 시드 계정(V12)이 이미 운영 DB 에 들어와 있는 경우 —
 * 부팅을 fail-fast 시켜, 알려진 비밀번호의 ADMIN 으로 기동되는 사고를 막는다.
 *
 * <p>한계: 운영 인프라인데 SPRING_PROFILES_ACTIVE 를 빠뜨려 local 로 폴백한 경우는 본 가드가 동작하지
 * 않는다 — 프로파일이 local 이면 정상 로컬 개발과 구분할 in-app 신호가 없기 때문이다. 그 시나리오는
 * 배포 시 프로파일 명시(SPRING_PROFILES_ACTIVE=prod)라는 운영 책임으로 막아야 하며, 본 가드는
 * '명시적 prod 인데 오염된' 경우에 대한 추가 방어선이다. (local/test 프로파일에는 동작하지 않는다.)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ProdSeedAccountGuard {

    private static final String PROD_PROFILE = "prod";
    private static final String DEV_SEED_LOCATION_MARKER = "migration-dev";

    // V12__seed_test_accounts_and_clubs.sql 이 심는 계정의 공개 테스트 비밀번호 해시(시크릿 아님 —
    // 평문 student123!/leader123!/admin123! 가 같은 파일 주석에 공개돼 있다). 이메일이 아니라 이 해시로
    // 식별하므로, 실제 학생이 우연히 같은 이메일(예: admin@daegu.ac.kr)로 가입해도 오탐(부팅 차단)하지 않는다.
    private static final List<String> SEED_ACCOUNT_PASSWORD_HASHES = List.of(
            "$2b$10$S1UDKlLy5TTKzI3DUe2uRuL.W2DT//TUnGs3Fmzo6fs3OKXRuYZD.",
            "$2b$10$8tArhzMmdVhfhvpGSzs1VeK56.UCDy0ezm/KzuLAIcTRamE2XePnG",
            "$2b$10$3n2TxB.c34Zq6BY5mj1fbONNibNA4Bddp9yAMWn2V3iFaBRI0VJfS");

    private final Environment environment;
    private final JdbcTemplate jdbcTemplate;

    @EventListener(ApplicationReadyEvent.class)
    public void verifyOnStartup() {
        if (!environment.acceptsProfiles(Profiles.of(PROD_PROFILE))) {
            return; // 운영 외(local/test)에는 적용하지 않는다.
        }
        verifyFlywayLocationsExcludeDevSeed();
        verifyNoSeedAccountsPresent();
        log.info("[운영 시드 가드] dev 시드 location/계정 미검출 — 정상.");
    }

    private void verifyFlywayLocationsExcludeDevSeed() {
        // 미설정 시 Flyway 기본값(classpath:db/migration)이 적용돼 dev 시드를 포함하지 않으므로 빈 문자열 폴백은 안전하다.
        String locations = environment.getProperty("spring.flyway.locations", "");
        if (locations.contains(DEV_SEED_LOCATION_MARKER)) {
            throw new IllegalStateException(
                    "운영 프로파일에서 dev 시드 마이그레이션(" + DEV_SEED_LOCATION_MARKER
                            + ")이 flyway.locations 에 포함되어 있습니다 — 분리 후 재기동하세요.");
        }
    }

    private void verifyNoSeedAccountsPresent() {
        // deleted_at 필터를 두지 않는다 — soft-delete 된 known-credential 행도 물리적으로 잔존하는 한 위험.
        // 네이티브 쿼리라 @SQLRestriction 이 적용되지 않으므로 삭제 여부와 무관하게 잡아낸다.
        String placeholders = String.join(", ",
                SEED_ACCOUNT_PASSWORD_HASHES.stream().map(hash -> "?").toList());
        Integer seededCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM users WHERE password_hash IN (" + placeholders + ")",
                Integer.class, SEED_ACCOUNT_PASSWORD_HASHES.toArray(new String[0]));
        if (seededCount != null && seededCount > 0) {
            throw new IllegalStateException(
                    "운영 DB 에서 dev 시드 계정(known credential)이 감지되었습니다 — 계정 제거·비밀번호 회전 후 재기동하세요.");
        }
    }
}
