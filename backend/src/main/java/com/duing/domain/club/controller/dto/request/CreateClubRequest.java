package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.service.dto.command.CreateClubCommand;
import com.duing.domain.user.entity.College;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateClubRequest(
        @NotBlank(message = "동아리 이름은 필수 입력값입니다.")
        @Size(max = 100, message = "동아리 이름은 100자 이하여야 합니다.")
        String name,

        @NotNull(message = "동아리 카테고리는 필수 입력값입니다.")
        ClubCategory category,

        @Size(max = 50, message = "분류는 50자 이하여야 합니다.")
        String division,

        String description,

        // http(s) 절대 URL(운영 S3) 또는 `/files/...` 내부 경로(로컬 스토리지)만 허용 — javascript:/data:
        // 등 스크립트 스킴과 프로토콜 상대경로(//)를 막아 저장 후 렌더 시 XSS·외부유출을 차단한다.
        @Size(max = 500, message = "로고 URL은 500자 이하여야 합니다.")
        @Pattern(regexp = "^$|^https?://.+$|^/[^/\\\\].*$",
                message = "로고 URL은 http:// 또는 https:// 로 시작하거나 / 로 시작하는 내부 경로여야 합니다.")
        String logoUrl,

        @NotNull(message = "동아리장 ID는 필수 입력값입니다.")
        Long leaderId,

        boolean centralClub,

        College college
) {
    public CreateClubCommand toCommand() {
        return new CreateClubCommand(name, category, division, description, logoUrl, leaderId, centralClub, college);
    }
}
