package com.duing.domain.user.controller.dto.request;

/**
 * 회원 이름 입력 규칙. 가입({@link SignupRequest})과 프로필 수정({@link UpdateProfileRequest})이 같은 정책을
 * 따라야 하는데, 한쪽 정규식만 넓히면 가입은 막히고 수정은 통과하는 비대칭이 조용히 생긴다.
 *
 * <p>금칙어(운영자 사칭 등) 차단은 값 형태가 아니라 의미의 문제라 {@code ReservedNamePolicy} 가 별도로 맡는다.
 */
public final class UserNameRules {

    /**
     * 한국어 기반 서비스 정책 — 한글 완성형(가~힣) 2~7자만 허용(자모·공백·숫자·영문·특수문자·이모지 불가).
     * 다국어 지원 시 이 정규식만 확장하면 된다. FE signupSchema 와 동일 정책.
     */
    public static final String KOREAN_NAME_PATTERN = "^[가-힣]{2,7}$";

    public static final String KOREAN_NAME_MESSAGE = "이름은 한글 2~7자만 입력할 수 있습니다.";

    private UserNameRules() {
        // 상수 모음 클래스 — 인스턴스화 금지
    }
}
