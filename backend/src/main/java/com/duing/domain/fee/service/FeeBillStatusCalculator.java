package com.duing.domain.fee.service;

import com.duing.domain.fee.entity.FeeStatus;
import java.time.Clock;
import java.time.LocalDate;
import org.springframework.stereotype.Component;

/**
 * 청구액·마감일·활성 납부 합계로 청구서 상태(FeeStatus)를 산출한다.
 * <p>CANCELLED 는 운영자 취소 전용이라 여기서 다루지 않는다. '오늘' 판정은 Asia/Seoul Clock 빈으로 결정적이게 한다.
 */
@Component
public class FeeBillStatusCalculator {

    private final Clock clock; // Asia/Seoul Clock 빈 주입(마감 경과 판정의 '오늘', 테스트 결정성)

    public FeeBillStatusCalculator(Clock clock) {
        this.clock = clock;
    }

    public FeeStatus calculate(long billAmount, LocalDate dueDate, long activePaidSum) {
        // 공식 정본은 FeeStatus.calculate — 저장 축(여기)과 표기 축(resolveDisplay)이 같은 식을 쓰도록 위임한다.
        return FeeStatus.calculate(billAmount, dueDate, activePaidSum, LocalDate.now(clock));
    }
}
