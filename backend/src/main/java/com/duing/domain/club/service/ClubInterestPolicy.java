package com.duing.domain.club.service;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

/**
 * 홈 "관심도가 높은 동아리" 정책 상수·식별자 산식의 단일 관리 지점.
 * <p>{@link ClubRecommendationPolicy}(탐색 추천순)와는 별개 축이다 — 이쪽은 "최근 1주일 동안 사람들이
 * 실제로 어떤 동아리를 눌러봤는가"만 본다. 회원 수·지원자 수는 쓰지 않는다.
 *
 * <pre>
 * weekly_visitor_count = 최근 7일 순방문자 수                       (감쇠 없음 — 화면 표시용)
 * interest_score       = Σ 일별 순방문자 × 0.5^(경과일 / 3)          (반감기 3일 — 정렬용)
 * </pre>
 *
 * <p><b>왜 감쇠를 두는가</b>: 창을 7일로 자르기만 하면 6일 전 이벤트성 트래픽 하루가 오늘의 꾸준한
 * 관심과 같은 무게를 갖는다. 반감기 3일이면 6일 전 방문은 오늘의 1/4로 내려가, 하루짜리 급등이
 * 일주일 내내 상단을 점유하지 못한다. 창 이탈(7일)로 인한 순위 급락도 함께 부드러워진다.
 *
 * <p><b>왜 정규화하지 않는가</b>: activity_score 와 달리 이 점수는 절대값 비교만 하면 되고(전체 최댓값
 * 대비 비율이 필요 없다), 정규화하면 재계산마다 전 동아리 점수가 함께 움직여 원인 추적이 어려워진다.
 */
public final class ClubInterestPolicy {

    private ClubInterestPolicy() {
    }

    /** 집계 창 — 오늘 포함 최근 7일. */
    public static final int WINDOW_DAYS = 7;

    /** 최근성 감쇠 반감기(일) — 경과일 d 의 가중치는 0.5^(d / HALF_LIFE_DAYS). */
    public static final int HALF_LIFE_DAYS = 3;

    /**
     * 원천 이벤트 보존 기간(일) — 오늘 포함 8일치({@code today-7 ~ today})를 남긴다.
     * 집계 창(7일)보다 하루 길게 잡아, 잡이 한 주기 밀리거나 자정 경계에서 실행돼도 창 안의 데이터가
     * 먼저 지워지지 않게 한다. 이보다 오래 늘리지 말 것 —
     * 보존 기간이 곧 익명 방문자의 행동 이력이 남는 기간이다.
     */
    public static final int RETENTION_DAYS = 8;

    /**
     * 클라이언트가 보관하는 익명 방문자 키를 저장용 해시로 변환한다.
     * <p>원문을 저장하지 않는 이유: DB 가 새더라도 그 값으로 특정 방문자를 사칭해 조회수를 조작할 수
     * 없게 한다. 날짜별 salt 를 섞지 않는 이유는 "7일 순방문자 수"가 날짜를 가로질러 같은 사람을 한 명으로
     * 세야 하기 때문이다 — 장기 프로파일화는 salt 대신 보존 기간({@link #RETENTION_DAYS})으로 막는다.
     */
    public static String visitorHash(String visitorKey) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(visitorKey.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException unsupportedAlgorithm) {
            // SHA-256 은 모든 JVM 이 제공하도록 규격에 정해져 있다 — 여기 오면 런타임이 깨진 것이다.
            throw new IllegalStateException("SHA-256 을 사용할 수 없습니다.", unsupportedAlgorithm);
        }
    }
}
