package com.duing.domain.notification.support;

/**
 * 운영진(회장·임원) 대상 지원서·모집 알림의 공용 조립 지점 — 링크와 본문 절단을 한곳에서 만든다.
 * 접수 알림 리스너와 일일 리마인더 잡이 같은 링크·절단 규칙을 쓰기 위해 모은다.
 */
public final class OperatorNotificationSupport {

    /** notification.body 컬럼 길이(300). */
    private static final int BODY_MAX_LENGTH = 300;

    private OperatorNotificationSupport() {
    }

    /** 운영 콘솔의 모집별 지원 현황 — 미처리(SUBMITTED) 필터로 연다. */
    public static String applicantsLink(Long clubId, Long recruitmentId) {
        return "/manage/clubs/" + clubId + "/recruitments/" + recruitmentId + "/applicants?status=SUBMITTED";
    }

    /** body 컬럼 상한 가드 — 모집 제목(200자) + 고정 문구는 지금 넘지 않지만, 문구가 늘어도 INSERT 가 깨지지 않게 한다. */
    public static String truncateBody(String body) {
        return body.length() <= BODY_MAX_LENGTH ? body : body.substring(0, BODY_MAX_LENGTH - 1) + "…";
    }
}
