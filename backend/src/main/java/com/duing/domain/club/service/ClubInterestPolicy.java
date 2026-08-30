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
 * weekly_visitor_count = 최근 7일 순방문자 수                        (감쇠 없음 — 화면 표시용)
 * decayed_visit_score  = Σ 조회 행 × 0.5^(경과일 / 3)                (반감기 3일 — 방문자·일 단위)
 * interest_score       = 0.65 × decayed_visit_score
 *                      + 0.35 × weekly_visitor_count               (정렬용 — 두 축의 합성)
 * </pre>
 *
 * <p><b>왜 감쇠를 두는가</b>: 창을 7일로 자르기만 하면 6일 전 이벤트성 트래픽 하루가 오늘의 꾸준한
 * 관심과 같은 무게를 갖는다. 반감기 3일이면 6일 전 방문은 오늘의 1/4로 내려가, 하루짜리 급등이
 * 일주일 내내 상단을 점유하지 못한다. 창 이탈(7일)로 인한 순위 급락도 함께 부드러워진다 — 다만
 * 아래 합성을 넣은 뒤로는 그 완화가 절반만 남는다. 순방문자 축에는 감쇠가 없어 창을 벗어나는 순간
 * 통째로 사라지므로, 하루에 몰린 트래픽의 이탈 직전 점수가 피크 대비 25% 에서 51.25% 로 올라간다
 * (= 그만큼 낙차가 커졌다). 감쇠가 아예 없던 시절보다는 여전히 완만하다.
 *
 * <p><b>왜 감쇠만으로 정렬하지 않는가</b>: 감쇠 합이 사람 수를 버리는 것은 아니다 — 같은 날 n 명이면
 * 정확히 {@code n × 0.5^(경과일/3)} 이라 사람 수가 선형으로 들어 있다. 문제는 그 단위가 사람이 아니라
 * <b>방문자·일</b> 이라는 것이고, 거기서 두 가지가 따라온다.
 * <ol>
 *   <li>창 끝(6일) 페널티가 4배로 가파르다 — 6일 전 쪽은 사람이 4배 많아야 오늘을 앞선다.</li>
 *   <li>한 사람이 여러 날 반복 조회하면 그 한 명이 여러 명처럼 쌓인다 — 7일 연속이면 3.89 가 되어
 *       오늘 서로 다른 3명(3.0)보다 높다.</li>
 * </ol>
 * DISTINCT 로 센 순방문자 수를 {@link #VISITOR_WEIGHT} 만큼 섞으면 둘 다 완만해진다. 창 끝 페널티는
 * 4배 → <b>약 2배</b>(정확히는 1.95배)로 내려가고, 위 반복 조회 예시는 3.89 대 3.0 에서 2.88 대 3.00 으로
 * 뒤집혀 <b>서로 다른 3명이 한 사람의 7일 연속 조회를 앞선다</b>. 비중을 올리면 최근성이 더 묽어지고
 * 내리면 다시 가팔라진다 — 어느 쪽이든 사람 수가 사라지지는 않는다(감쇠 축 안에 선형으로 남는다).
 * 경계는 0.30688 이고 그 아래로 내리면 위 반복 조회 예시가 도로 뒤집힌다 — 여유를 두려면 0.35 처럼
 * 경계에서 떨어진 값을 쓸 것(0.31 도 뒤집히지는 않지만 경계에 붙어 있다).
 *
 * <p>이 합성이 <b>보장하지 않는 것</b>도 적어 둔다: "사람 수가 같으면 최근에 본 쪽이 앞선다" 는
 * 성립하지 않는다. 한 사람이 1~6일 전에 걸쳐 여섯 번 보면 2.23 이라, 같은 한 사람이 오늘 한 번 본
 * 1.00 을 앞선다. 감쇠 축이 방문자·일 단위인 이상 반복 조회는 여전히 쌓인다 — 합성은 그 기울기를
 * 낮출 뿐이다.
 *
 * <p><b>왜 정규화하지 않는가</b>: activity_score 와 달리 이 점수는 절대값 비교만 하면 되고(전체 최댓값
 * 대비 비율이 필요 없다), 정규화하면 재계산마다 전 동아리 점수가 함께 움직여 원인 추적이 어려워진다.
 * 두 축을 그냥 더할 수 있는 것도 같은 이유다 — 감쇠 합은 방문자·일, 순방문자 수는 사람 수라 단위가
 * 다르지만 둘의 비는 최대 3.89배(한 사람이 7일 연속 조회)에 그친다. 스케일을 맞추는 정규화 없이
 * 가중치만으로 비중이 정해진다.
 */
public final class ClubInterestPolicy {

    private ClubInterestPolicy() {
    }

    /** 집계 창 — 오늘 포함 최근 7일. */
    public static final int WINDOW_DAYS = 7;

    /** 최근성 감쇠 반감기(일) — 경과일 d 의 가중치는 0.5^(d / HALF_LIFE_DAYS). */
    public static final int HALF_LIFE_DAYS = 3;

    /**
     * 정렬 점수에서 감쇠 없는 순방문자 수가 갖는 비중 — 나머지(1 - 이 값)는 최근성 감쇠 축이 가져간다.
     * 0.307 이 "서로 다른 3명 vs 한 사람의 7일 연속" 이 뒤집히는 경계라, 그 위로 여유를 두고 잡았다.
     */
    public static final double VISITOR_WEIGHT = 0.35;

    /**
     * 원천 이벤트 보존 기간(일) — 오늘 포함 8일치({@code today-7 ~ today})를 남긴다.
     * 집계 창(7일)보다 하루 길게 잡아, 잡이 한 주기 밀리거나 자정 경계에서 실행돼도 창 안의 데이터가
     * 먼저 지워지지 않게 한다. 이보다 오래 늘리지 말 것 —
     * 보존 기간이 곧 익명 방문자의 행동 이력이 남는 기간이다.
     */
    public static final int RETENTION_DAYS = 8;

    /**
     * 최근성 축과 사람 수 축을 합성한 홈 관심도 정렬 점수.
     *
     * @param decayedVisitScore 창 안 조회에 반감기 감쇠를 적용해 합산한 값
     * @param weeklyVisitorCount 창 안 순방문자 수(감쇠 없음)
     */
    public static double interestScore(double decayedVisitScore, int weeklyVisitorCount) {
        return (1 - VISITOR_WEIGHT) * decayedVisitScore + VISITOR_WEIGHT * weeklyVisitorCount;
    }

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
