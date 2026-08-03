package com.duing.domain.joincode.service.dto.command;

import com.duing.domain.joincode.exception.JoinCodeException;
import java.util.Set;

/**
 * 가입 코드 생성 명령. 만료 기간은 7/30/90일 중 하나만 허용한다(스펙 4.1 — 무기한 옵션 없음).
 * 열거 검증을 Bean Validation 이 아닌 compact constructor 에 두는 이유는 허용 집합이 도메인 정책이기
 * 때문이다(CreateRecruitmentCommand 의 모드별 검증 전례).
 */
public record CreateJoinCodeCommand(
        Long clubId,
        Long requesterId,
        Integer maxUses,
        Integer expiresInDays,
        Integer generation
) {
    private static final Set<Integer> ALLOWED_EXPIRES_IN_DAYS = Set.of(7, 30, 90);

    public CreateJoinCodeCommand {
        if (!ALLOWED_EXPIRES_IN_DAYS.contains(expiresInDays)) {
            throw new JoinCodeException.InvalidExpiresInDaysException();
        }
    }
}
