package com.duing.global.constant;

/**
 * 사용자·운영진이 입력하는 외부 링크 필드의 공통 스킴 규칙.
 * 빈 문자열("미입력"/"비우기" 시맨틱)을 허용하고, 값이 있으면 http(s) 절대 URL 만 통과시킨다 —
 * javascript:/data: 등 스크립트 스킴이 저장된 뒤 렌더 시점에 저장형 XSS 가 되는 것을 DTO 단계에서 막는다.
 *
 * <p>같은 계약을 쓰는 필드 7곳:
 * 홍보 배너 생성·수정({@code linkUrl}), 홍보 요청 생성({@code suggestedLinkUrl}),
 * 공지 생성·수정({@code linkUrl}), 총동연 행사 생성·수정({@code linkUrl}).
 * 길이 상한은 도메인마다 달라(공지·홍보 2000자 / 행사 500자) 각 DTO 에 남는다.
 *
 * <p><b>여기에 넣으면 안 되는 것</b><br>
 * 모집 공고의 {@code externalFormUrl} 은 이 패턴을 쓰지 않는다. "EXTERNAL 모드일 때만 필수" 조건을
 * 필드 제약으로 표현할 수 없어 스킴·도메인 검증이 화이트리스트({@code ExternalFormUrlValidator}) 로
 * 옮겨갔고, 필드에는 길이 상한만 남아 있다. 이 상수를 붙이면 화이트리스트보다 먼저 걸려
 * 계약이 바뀐다({@code LinkUrlSchemeValidationTest} 가 "필드 제약 없음"을 잠그고 있다).
 * 동아리 SNS 링크 엔티티({@code ClubSnsLink}) 의 {@code "^https?://.+"} 도 빈값 불허·끝 앵커 없음이라
 * 의미가 다른 별개 규칙이다.
 */
public final class LinkUrlPatterns {

    /** 빈 문자열 또는 http(s) 절대 URL. */
    public static final String HTTP_LINK_OR_EMPTY = "^$|^https?://.+$";

    public static final String HTTP_LINK_MESSAGE = "링크는 http:// 또는 https:// 로 시작해야 합니다.";

    private LinkUrlPatterns() {
        // 상수 모음 클래스 — 인스턴스화 금지
    }
}
