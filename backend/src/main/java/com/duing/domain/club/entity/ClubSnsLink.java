package com.duing.domain.club.entity;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 기본 4종(INSTAGRAM/FACEBOOK/KAKAO) + OTHER(플랫폼명 직접 입력).
 * 과거 X/YOUTUBE/WEB 값은 V91 에서 OTHER + label 로 데이터 변환됐다.
 */
public record ClubSnsLink(
        @NotNull(message = "SNS 플랫폼은 필수입니다.")
        @Pattern(regexp = "INSTAGRAM|FACEBOOK|KAKAO|OTHER",
                message = "허용된 SNS 플랫폼이 아닙니다.")
        String platform,

        @Size(max = 20, message = "플랫폼명은 20자 이하여야 합니다.")
        String label,

        @NotNull(message = "SNS URL은 필수입니다.")
        @Size(min = 1, max = 500, message = "SNS URL은 1~500자여야 합니다.")
        @Pattern(regexp = "^https?://.+", message = "SNS URL은 http(s):// 로 시작해야 합니다.")
        String url
) {
    @AssertTrue(message = "기타 플랫폼은 플랫폼명을 입력해야 합니다.")
    public boolean isLabelPresentForOther() {
        return !"OTHER".equals(platform) || (label != null && !label.isBlank());
    }

    /** OTHER 외 플랫폼의 label 은 저장하지 않는다 — 요청에 실려 와도 null 정규화 (§4.2). */
    public ClubSnsLink normalized() {
        if ("OTHER".equals(platform)) {
            return new ClubSnsLink(platform, label == null ? null : label.strip(), url);
        }
        return label == null ? this : new ClubSnsLink(platform, null, url);
    }
}
