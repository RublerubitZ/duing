package com.duing.domain.club.metric.service;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.metric.repository.ClubViewEventRepository;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.ClubInterestPolicy;
import com.duing.domain.club.service.dto.command.RecordClubViewCommand;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubViewService implements ClubViewService {

    private final ClubViewEventRepository clubViewEventRepository;
    private final ClubRepository clubRepository;
    private final ClubViewRateLimiter clubViewRateLimiter;
    // 하루 단위 dedup 의 "하루"는 학생의 하루(KST)다 — seoulClock.
    private final Clock clock;

    @Override
    @Transactional
    public void recordView(RecordClubViewCommand recordCommand) {
        // 총량 상한을 DB 접근보다 먼저 검사한다 — 거절될 요청이 조회·삽입까지 내려가지 않게 한다.
        clubViewRateLimiter.assertAndRecordView(recordCommand.clientIp(), LocalDateTime.now(clock));

        // 존재하지 않거나 공개 대상이 아닌 동아리는 404. 검사를 생략하면 FK 위반이 500 으로 새어 나가고,
        // 비공개 동아리의 행이 쌓였다가 재공개 시점에 과거 조회로 되살아난다.
        if (!clubRepository.existsByIdAndStatus(recordCommand.clubId(), ClubStatus.ACTIVE)) {
            throw new ClubException.ClubNotFoundException();
        }

        clubViewEventRepository.insertIgnoringDuplicate(
                recordCommand.clubId(),
                ClubInterestPolicy.visitorHash(recordCommand.visitorKey()),
                LocalDate.now(clock));
    }
}
