package com.duing.domain.club.entity;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ClubSnsLink(
        @NotNull(message = "SNS 플랫폼은 필수입니다.")
        @Pattern(regexp = "INSTAGRAM|FACEBOOK|X|YOUTUBE|KAKAO|WEB",
                message = "허용된 SNS 플랫폼이 아닙니다.")
        String platform,

        @NotNull(message = "SNS URL은 필수입니다.")
        @Size(min = 1, max = 500, message = "SNS URL은 1~500자여야 합니다.")
        @Pattern(regexp = "^https?://.+", message = "SNS URL은 http(s):// 로 시작해야 합니다.")
        String url
) {
}
