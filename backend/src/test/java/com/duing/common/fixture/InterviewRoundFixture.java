package com.duing.common.fixture;

import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.RoundStatus;
import java.lang.reflect.Field;
import java.time.LocalDateTime;

public final class InterviewRoundFixture {

    private InterviewRoundFixture() {
    }

    public static InterviewRound draft(Long recruitmentId, LocalDateTime availabilityDeadline) {
        return InterviewRound.create(recruitmentId, "1차 면접", availabilityDeadline, null);
    }

    /**
     * 상태 전이 메서드는 해당 API PR(BE#3~)에서 TDD 로 도입된다. 그 전까지 테스트 셋업은
     * saveActiveClub 의 ClubStatus 리플렉션 전례를 따라 status 를 직접 세팅한다.
     */
    public static InterviewRound withStatus(Long recruitmentId, LocalDateTime availabilityDeadline,
                                            String location, RoundStatus status) {
        InterviewRound round = InterviewRound.create(recruitmentId, "1차 면접", availabilityDeadline, location);
        try {
            Field statusField = InterviewRound.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(round, status);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException(reflectionFailure);
        }
        return round;
    }
}
