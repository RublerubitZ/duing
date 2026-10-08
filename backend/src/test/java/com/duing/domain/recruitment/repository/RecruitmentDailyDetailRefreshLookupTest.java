package com.duing.domain.recruitment.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/**
 * 동아리 상세 매일 재생성 대상 — 날짜만으로 상세의 모집 표기(시작일 도래·마감 다음 날)나 지원자 수가 바뀌는 동아리만
 * 고른다. 마감 전이는 어제·그제 마감 이틀을 대상으로 둬 하루 재시도를 준다. 경계(오늘 시작·그제 마감)는 포함, 그 바깥
 * (내일 시작·사흘 전 마감)은 제외로 양쪽을 고정한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RecruitmentDailyDetailRefreshLookupTest extends IntegrationTestBase {

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("진행 중·오늘 시작·어제 마감·그제 마감·시작한 상시모집이 있는 동아리는 매일 재생성 대상이다")
    void includesClubsWhoseDetailChangesByDate() {
        LocalDate today = LocalDate.now(clock);
        Club ongoingClub = clubRepository.save(ClubFixture.academic("진행중동아리"));
        saveRecruitment(ongoingClub, today.minusDays(3), today.plusDays(3));
        Club startsTodayClub = clubRepository.save(ClubFixture.academic("오늘시작동아리"));
        saveRecruitment(startsTodayClub, today, today.plusDays(5));
        Club endedYesterdayClub = clubRepository.save(ClubFixture.academic("어제마감동아리"));
        saveRecruitment(endedYesterdayClub, today.minusDays(10), today.minusDays(1));
        // 마감 전이의 하루 재시도 — 어제 요청이 실패했어도 오늘 한 번 더 그린다.
        Club endedTwoDaysAgoClub = clubRepository.save(ClubFixture.academic("그제마감동아리"));
        saveRecruitment(endedTwoDaysAgoClub, today.minusDays(10), today.minusDays(2));
        Club alwaysOpenClub = clubRepository.save(ClubFixture.academic("상시모집동아리"));
        saveRecruitment(alwaysOpenClub, today.minusDays(5), null);

        assertThat(recruitmentRepository.findClubIdsWithOngoingOrJustEndedRecruitment(today))
                .containsExactly(ongoingClub.getId(), startsTodayClub.getId(), endedYesterdayClub.getId(),
                        endedTwoDaysAgoClub.getId(), alwaysOpenClub.getId());
    }

    @Test
    @DisplayName("사흘 전 이전 마감·내일 시작·수동 마감·삭제된 모집만 있거나 모집이 없는 동아리는 대상이 아니다")
    void excludesClubsWhoseDetailStaysTheSame() {
        LocalDate today = LocalDate.now(clock);
        // 수동 마감하지 않아 OPEN 으로 남은 옛 모집 — 마감 뒤 이틀만 대상이고, 그 뒤로 매일 잡히면 안 된다.
        Club endedThreeDaysAgoClub = clubRepository.save(ClubFixture.academic("사흘전마감동아리"));
        saveRecruitment(endedThreeDaysAgoClub, today.minusDays(10), today.minusDays(3));
        Club startsTomorrowClub = clubRepository.save(ClubFixture.academic("내일시작동아리"));
        saveRecruitment(startsTomorrowClub, today.plusDays(1), today.plusDays(8));
        Club manuallyClosedClub = clubRepository.save(ClubFixture.academic("수동마감동아리"));
        Recruitment manuallyClosed = saveRecruitment(manuallyClosedClub, today.minusDays(3), today.plusDays(3));
        manuallyClosed.close(LocalDateTime.now(clock));
        recruitmentRepository.save(manuallyClosed);
        Club deletedRecruitmentClub = clubRepository.save(ClubFixture.academic("삭제모집동아리"));
        Recruitment deletedRecruitment = saveRecruitment(deletedRecruitmentClub, today.minusDays(3), today.plusDays(3));
        recruitmentRepository.delete(deletedRecruitment);
        clubRepository.save(ClubFixture.academic("모집없는동아리"));

        assertThat(recruitmentRepository.findClubIdsWithOngoingOrJustEndedRecruitment(today)).isEmpty();
    }

    private Recruitment saveRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        Recruitment created = Recruitment.create(
                club, "모집-" + sequence.getAndIncrement(), null, startDate, endDate, 10);
        return recruitmentRepository.save(created);
    }
}
