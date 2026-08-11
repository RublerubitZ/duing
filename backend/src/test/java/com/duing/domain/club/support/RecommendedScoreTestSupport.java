package com.duing.domain.club.support;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.service.ClubRecommendationPolicy;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * SQL {@code hourly_shuffle}(PostgresFunctionContributor) 산식의 Java 복제.
 * <p>SQL↔Java 동치는 {@code ClubRecommendedSortTest} 가 실제 PG 로 검증한다 — 한쪽만 바꾸면
 * 그 테스트가 깨진다. 가중치는 {@link ClubRecommendationPolicy} 상수를 그대로 사용해
 * 테스트에 산식이 중복 하드코딩되지 않게 한다.
 */
public final class RecommendedScoreTestSupport {

    private RecommendedScoreTestSupport() {
    }

    /** md5(source:bucket) hex 앞 8자 → 부호비트 제거 → INT_MAX 정규화. SQL 패턴과 동치. */
    public static double shuffleScore(String source, String hourBucket) {
        String md5Hex = md5Hex(source + ":" + hourBucket);
        long firstEightHexAsUnsigned = Long.parseLong(md5Hex.substring(0, 8), 16);
        return (double) (firstEightHexAsUnsigned & 0x7FFFFFFFL) / Integer.MAX_VALUE;
    }

    /** 그룹 내부 최종 점수 — ClubRepositoryImpl 의 RECOMMENDED finalScore 와 동일 산식. */
    public static double finalScore(long clubId, ClubCategory category, String hourBucket, double activityScore) {
        double randomScore =
                shuffleScore(String.valueOf(clubId), hourBucket) * ClubRecommendationPolicy.CLUB_SHUFFLE_WEIGHT
                + shuffleScore(category.name(), hourBucket) * ClubRecommendationPolicy.CATEGORY_SHUFFLE_WEIGHT;
        return randomScore * ClubRecommendationPolicy.RANDOM_WEIGHT
                + activityScore * ClubRecommendationPolicy.ACTIVITY_WEIGHT;
    }

    private static String md5Hex(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            byte[] hashed = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hashed.length * 2);
            for (byte hashByte : hashed) {
                hex.append(String.format("%02x", hashByte));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("MD5 미지원 JVM 은 없다", e);
        }
    }
}
