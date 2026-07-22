package com.duing.domain.club.entity;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

// JSONB 스키마 진화 대비 — 이후 버전이 키를 추가한 뒤 이 버전으로 롤백해도 역직렬화가 깨지지 않게 한다.
@JsonIgnoreProperties(ignoreUnknown = true)
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
