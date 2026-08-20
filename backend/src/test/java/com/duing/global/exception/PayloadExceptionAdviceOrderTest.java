package com.duing.global.exception;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.facilitybooking.controller.FacilityBookingExceptionAdvice;
import com.duing.domain.interview.controller.InterviewExceptionAdvice;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;

/**
 * payload 를 실어 보내는 도메인 어드바이스들이 {@link GlobalExceptionHandler} 의 ApplicationException
 * catch-all 보다 먼저 실행된다는 계약을 고정한다. 이 우선순위가 깨지면 catch-all 이 먼저 잡아
 * 응답 body 의 data(겹침 목록·미처리 멤버 2종)가 통째로 사라진다 — 상태 코드·메시지는 그대로라
 * 풀스택 테스트에서도 눈에 잘 띄지 않는 조용한 회귀다.
 *
 * <p>@Order 를 지워도 당장은 통과할 수 있다(동순위일 때 컴포넌트 스캔이 com.duing.domain.* 을
 * com.duing.global.* 보다 먼저 훑어 우연히 도메인 어드바이스가 이긴다). 그 우연에 기대면 패키지 이동·
 * 리네임 같은 무관한 개편에서 뒤늦게 터지므로, 어노테이션 자체를 여기서 못 박는다.
 */
class PayloadExceptionAdviceOrderTest {

    @Test
    @DisplayName("payload 어드바이스는 전역 catch-all 보다 먼저 실행되도록 최우선 순위를 고정한다")
    void payloadAdvicesArePinnedToHighestPrecedence() {
        assertThat(orderValueOf(InterviewExceptionAdvice.class)).isEqualTo(Ordered.HIGHEST_PRECEDENCE);
        assertThat(orderValueOf(FacilityBookingExceptionAdvice.class)).isEqualTo(Ordered.HIGHEST_PRECEDENCE);
    }

    private static int orderValueOf(Class<?> adviceClass) {
        Order order = adviceClass.getAnnotation(Order.class);
        assertThat(order)
                .as("%s 에 @Order 가 없다 — 전역 catch-all 과 동순위가 되어 payload 가 소실될 수 있다",
                        adviceClass.getSimpleName())
                .isNotNull();
        return order.value();
    }
}
