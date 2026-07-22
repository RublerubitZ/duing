package com.duing.domain.club.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 기본 4종(INSTAGRAM/FACEBOOK/KAKAO) + OTHER(플랫폼명 직접 입력).
 * 과거 X/YOUTUBE/WEB 값은 V91 에서 OTHER + label 로 데이터 변환됐다.
 */
// JSONB 스키마 진화 대비 — 미래 버전이 키를 추가해도 이 버전으로 롤백 시 역직렬화가 깨지지 않게 한다.
@JsonIgnoreProperties(ignoreUnknown = true)
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
    // @JsonIgnore: 검증 전용 파생 프로퍼티. JSONB 직렬화 시 실제 필드로 새어 나가 역직렬화가 깨지는 것을 막는다
    // (Bean Validation 은 Jackson 어노테이션과 무관하게 리플렉션으로 이 메서드를 읽는다).
    @JsonIgnore
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
