package com.duing.domain.application.service;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.entity.ApplicationStatusHistory;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.user.entity.User;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 지원 상태 전이의 단일 조립 지점 — 이전 상태 캡처 → FSM 전이(Application.transitionTo) → 상태 이력 기록.
 * FSM 가드는 엔티티가 단독으로 소유하고, 여기는 "전이했으면 이력을 남긴다"는 짝 계약만 강제한다.
 * 트랜잭션 경계는 호출자의 것을 그대로 쓴다 — 전이와 이력은 같은 커밋 단위여야 하기 때문이다.
 * <p>
 * 예외는 없다 — 이력을 남기지 않던 동아리 폐쇄 일괄 거절(GeneralApplicationService.rejectActiveOnClubClosure)도
 * 2026-08-23 정책 확정으로 이 경로를 경유한다. 상태 전이는 전부 여기를 지나므로 이력이 비는 전이는 존재하지 않는다.
 */
@Component
@RequiredArgsConstructor
public class ApplicationStatusChanger {

    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository;

    /**
     * 이력 주체는 {@link Supplier} 로 받아 전이가 성공한 뒤에만 해석한다 — FSM 에 막히는 전이에서는
     * 주체 조회(DB 왕복)가 일어나지 않아야 하고, 주체를 미리 확보해 둔 호출자(면접 라운드 생성)와
     * 전이 이후에야 조회하는 호출자(지원 상태 변경) 사이의 조회 시점 차이도 그대로 보존된다.
     */
    public void change(Application application, ApplicationStatus newStatus,
                       boolean useInterview, boolean recruitmentClosed,
                       Supplier<User> changedByResolver) {
        ApplicationStatus previousStatus = application.getStatus();
        application.transitionTo(newStatus, useInterview, recruitmentClosed);
        applicationStatusHistoryRepository.save(ApplicationStatusHistory.record(
                application, previousStatus, newStatus, changedByResolver.get()));
    }
}
