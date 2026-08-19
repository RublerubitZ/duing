package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.entity.FeeCycle;
import com.duing.global.constant.LinkUrlPatterns;

/**
 * 동아리 프로필 입력 규칙. 리더 수정({@link UpdateClubRequest})·총동연 수정({@link AdminUpdateClubRequest})·
 * 생성({@link CreateClubRequest}) 요청이 같은 프로필 필드를 받는데, 세 DTO 가 각자 리터럴을 들고 있으면
 * 한쪽만 고쳐도 컴파일은 통과하고 권한별로 통과 기준이 달라진다. 공유 필드의 값은 여기서 한 번만 정의한다.
 *
 * <p>제약 자체가 실제로 동일하게 붙어 있는지는 {@code ClubUpdateRequestConstraintParityTest} 가 잠근다.
 * 총동연 전용 필드(동아리명·카테고리·분과·단과대학)는 리더 요청에 아예 없으므로 여기 대상이 아니다.
 */
public final class ClubProfileValidationRules {

    /**
     * http(s) 절대 URL(운영 S3) 또는 {@code /files/...} 내부 경로(로컬 스토리지)만 허용 —
     * javascript:/data: 등 스크립트 스킴과 프로토콜 상대경로(//)를 막아 저장 후 렌더 시 XSS·외부유출을 차단한다.
     */
    public static final String LINK_OR_INTERNAL_PATH = LinkUrlPatterns.HTTP_LINK_OR_EMPTY + "|^/[^/\\\\].*$";

    public static final String LOGO_URL_MESSAGE =
            "로고 URL은 http:// 또는 https:// 로 시작하거나 / 로 시작하는 내부 경로여야 합니다.";
    public static final String COVER_URL_MESSAGE =
            "커버 URL은 http:// 또는 https:// 로 시작하거나 / 로 시작하는 내부 경로여야 합니다.";

    public static final int URL_MAX = 500;

    public static final int TAGS_MAX = 20;
    public static final int TAG_LENGTH_MIN = 1;
    public static final int TAG_LENGTH_MAX = 20;

    public static final int SNS_LINKS_MAX = 10;
    public static final int FAQS_MAX = 20;

    public static final int FOUNDED_YEAR_MIN = 1900;
    public static final int FOUNDED_YEAR_MAX = 2100;
    public static final int COHORT_NUMBER_MIN = 1;

    public static final int LOCATION_MAX = 200;
    public static final int ACTIVITY_FREQUENCY_MIN = 1;
    public static final int TAGLINE_MAX = 60;

    public static final int HIGHLIGHTS_MAX = 10;
    public static final int HIGHLIGHT_LENGTH_MIN = 1;
    public static final int HIGHLIGHT_LENGTH_MAX = 100;

    public static final int FEE_AMOUNT_MIN = 1;
    public static final int FEE_AMOUNT_MAX = 10_000_000;
    public static final int FEE_NOTE_MAX = 150;

    public static final int PROJECTS_MAX = 6;
    public static final int DEPARTMENT_MAX = 50;

    /** 회비는 주기+금액 쌍 전송 규약 (§4.3) — 주기 없이 금액만, NONE+금액, 유료 주기+금액 누락 전부 거부. */
    public static boolean isFeePairConsistent(FeeCycle feeCycle, Integer membershipFeeAmount) {
        if (feeCycle == null) return membershipFeeAmount == null;
        if (feeCycle == FeeCycle.NONE) return membershipFeeAmount == null;
        return membershipFeeAmount != null;
    }

    private ClubProfileValidationRules() {
        // 상수·검증 규칙 모음 클래스 — 인스턴스화 금지
    }
}
