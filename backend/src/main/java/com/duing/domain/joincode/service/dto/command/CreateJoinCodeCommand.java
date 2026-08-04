package com.duing.domain.joincode.service.dto.command;

import com.duing.domain.joincode.exception.JoinCodeException;
import java.util.Set;

/**
 * 가입 링크 생성 명령. 가입 가능 기간은 모집 종료 기준 0(종료일까지)/7/14일 프리셋만 허용한다
 * (스펙 v2 4.3 — 직접 날짜 입력 없음, 14일 초과 불가로 장기 링크 유지 우회를 막는다).
 * 열거 검증을 Bean Validation 이 아닌 compact constructor 에 두는 이유는 허용 집합이 도메인 정책이기
 * 때문이다(CreateRecruitmentCommand 의 모드별 검증 전례).
 */
public record CreateJoinCodeCommand(
        Long clubId,
        Long recruitmentId,
        Long requesterId,
        Integer maxUses,
        Integer joinWindowDays,
        Integer generation
) {
    /** 미지정 시 기본 프리셋 — 요청 경계에서 채운다. */
    public static final int DEFAULT_JOIN_WINDOW_DAYS = 7;

    private static final Set<Integer> ALLOWED_JOIN_WINDOW_DAYS = Set.of(0, 7, 14);

    public CreateJoinCodeCommand {
        if (!ALLOWED_JOIN_WINDOW_DAYS.contains(joinWindowDays)) {
            throw new JoinCodeException.InvalidJoinWindowDaysException();
        }
    }
}
