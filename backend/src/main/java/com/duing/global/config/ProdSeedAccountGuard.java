package com.duing.global.config;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
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
 * 부팅을 fail-fast 시켜, 알려진 비밀번호의 ADMIN 으로 기동되는 사고를 막는다. 같은 '알려진 자격 증명으로 운영 기동
 * 금지' 성격으로, 테스트·CI 에 평문이 공개된 더미 시크릿이 운영 시크릿으로 들어온 경우도 막는다(#1324).
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
    // 평문 student123!/leader123!/admin123! 가 같은 파일 주석에 공개돼 있다). 학번이 아니라 이 해시로
    // 식별하므로, 실제 학생이 입학연도 우연의 일치로 같은 학번(예: 20250003)을 배정받아도 오탐(부팅 차단)하지 않는다.
    private static final List<String> SEED_ACCOUNT_PASSWORD_HASHES = List.of(
            "$2b$10$S1UDKlLy5TTKzI3DUe2uRuL.W2DT//TUnGs3Fmzo6fs3OKXRuYZD.",
            "$2b$10$8tArhzMmdVhfhvpGSzs1VeK56.UCDy0ezm/KzuLAIcTRamE2XePnG",
            "$2b$10$3n2TxB.c34Zq6BY5mj1fbONNibNA4Bddp9yAMWn2V3iFaBRI0VJfS");

    // 공개 더미면 운영 기동을 막을 시크릿 프로퍼티(운영에서는 ${…} 가 해석된 값으로 읽힌다).
    static final List<String> SECRET_PROPERTY_KEYS = List.of(
            "jwt.secret",
            "web-auth.hint-secret",
            "phone-verification.secret",
            "security.fee-account.encryption-key",
            "duing.frontend.revalidate-secret");

    // 테스트·CI 에 평문이 공개된 더미 시크릿의 SHA-256(UTF-8 hex) — 평문은 코드에 두지 않는다(비밀 스캐너 오탐·검색 혼동
    // 방지). 평문과의 대응은 ProdSeedAccountGuardTest 가 다시 계산해 확인한다. 키별이 아니라 전체 집합과 비교해
    // 더미를 엉뚱한 키에 넣은 실수도 잡는다.
    static final Set<String> PUBLIC_DUMMY_SECRET_SHA256 = Set.of(
            "4593cf600764cc12b97cf74616e2c85ac38b7ac95102bd3523a0fac81b751304",
            "4d620bbe96968d6305feb94c0f2261039b74b8f28141ede2255fd06f68c777f7",
            "87b24cd8de0edd16284caccaa2bb6406f99e967f15dd640c3a0c074698b08c32",
            "9e1e446256c0d15af936508b441d8c937e54c131c8f6cfb2fbd2fc6857d6e0af",
            "66ba53bae7d8631c934ed1d14b2c900492e11f97c87b8c0bd7db7ad80fc8f6c5",
            "718815d848b7ccfdafdc6522f21ff4cd3064ee9f987eccc4231a2da88a37c9f4",
            "c6601ae0c4647880382fd4612222fd47160ec349ddaf7d4aa7a7e17cf4125fd2",
            "3eb1bd439947eb762998e566ccc2e099c791118b2f40579cc4f7da2b5061b7f9",
            "06b3f9443d57efb7258c56b357cbe90092dffe21f9cdeeeca2382c335677590b",
            "58e9cef9256d73a488a3056cceb2fc2b5b4576a2d9223e4ce3b68b7a31ba9842",
            "0fff7199f9ccb49374ae27175b459299dbe4b95f185b8a90ddd86f34bbd3ed04");

    private final Environment environment;
    private final JdbcTemplate jdbcTemplate;

    @EventListener(ApplicationReadyEvent.class)
    public void verifyOnStartup() {
        if (!environment.acceptsProfiles(Profiles.of(PROD_PROFILE))) {
            return; // 운영 외(local/test)에는 적용하지 않는다.
        }
        verifyNoPublicDummySecrets();
        verifyFlywayLocationsExcludeDevSeed();
        verifyNoSeedAccountsPresent();
        log.info("[운영 시드 가드] dev 시드 location/계정·공개 더미 시크릿 미검출 — 정상.");
    }

    private void verifyNoPublicDummySecrets() {
        for (String propertyKey : SECRET_PROPERTY_KEYS) {
            String secretValue = environment.getProperty(propertyKey);
            if (secretValue == null) {
                continue;
            }
            // .env 끝 공백·개행 실수까지 — 원값과 strip 한 값 둘 다 본다.
            if (isPublicDummy(secretValue) || isPublicDummy(secretValue.strip())) {
                // 값은 싣지 않는다. 교체가 단순 재기동으로 끝나지 않는 키가 있어 함께 안내한다 — FeeAccountCipher 는 키
                // 하나만 받아(회전 미지원) 바꾸면 기존 암호문을 못 풀고, 힌트·재검증 시크릿은 Vercel 값과 한 쌍이다.
                throw new IllegalStateException("운영 시크릿 " + propertyKey
                        + " 이 테스트·CI 에 공개된 더미 값입니다 — 교체 전 확인: FEE_ACCOUNT_ENC_KEY 는 저장된 계좌번호 재암호화가 필요하고, "
                        + "AUTH_HINT_SECRET·DUING_FRONTEND_REVALIDATE_SECRET 은 Vercel 값과 함께 바꿉니다.");
            }
        }
    }

    private static boolean isPublicDummy(String secretValue) {
        return PUBLIC_DUMMY_SECRET_SHA256.contains(sha256Hex(secretValue));
    }

    private static String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException missingSha256) {
            throw new IllegalStateException("SHA-256 을 쓸 수 없습니다", missingSha256); // 모든 JDK 필수 알고리즘이라 오지 않는다
        }
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
