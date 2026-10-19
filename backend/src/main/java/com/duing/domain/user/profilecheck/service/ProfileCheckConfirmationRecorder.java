package com.duing.domain.user.profilecheck.service;

import com.duing.domain.user.profilecheck.entity.ProfileCheckConfirmation;
import com.duing.domain.user.profilecheck.entity.Semester;
import com.duing.domain.user.profilecheck.repository.ProfileCheckConfirmationRepository;
import java.time.Clock;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 학기별 정보 확인 기록을 남기는 유일한 곳 — 팝업 확인·프로필 저장·가입이 부른다.
 *
 * <p>호출자의 트랜잭션에서 돈다. 세 경로 모두 그 사용자 행 잠금 안이거나 새 사용자라 조회 후 삽입으로 충분하고,
 * 최종 방어는 UNIQUE(학기, 사용자)다. 학기는 호출자가 넘긴다 — 여기서 다시 계산하면 자정 경계에서 호출자가
 * 검증한 학기와 기록하는 학기가 갈린다.
 */
@Component
@RequiredArgsConstructor
public class ProfileCheckConfirmationRecorder {

    private final ProfileCheckConfirmationRepository confirmationRepository;
    private final Clock clock;

    public void record(Long userId, Semester semester) {
        if (confirmationRepository.existsByUserIdAndSemesterYearAndSemesterTerm(
                userId, semester.year(), semester.term())) {
            return;
        }
        confirmationRepository.save(ProfileCheckConfirmation.of(userId, semester, Instant.now(clock)));
    }
}
