package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.ClubDetailQuery;
import com.duing.domain.club.service.dto.query.ClubViewer;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

/**
 * 공개 동아리 상세 조회의 요청당 쿼리 수 회귀 테스트.
 *
 * <p>상세의 대표 모집 단건 조회를 엔티티로 읽으면 form eager +1 쿼리(questions jsonb)가 붙고
 * content TEXT 까지 실려 온다 — 스칼라 projection 전환(성능 감사 P1-6) 후에는 대표 모집 유무·이력
 * 수와 무관하게 쿼리 수가 상수여야 한다. 계측 방식은 {@code RecruitmentPublicQueryCountTest} 와 동일.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ClubDetailQueryCountTest {

    @Autowired ClubService clubService;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired EntityManagerFactory entityManagerFactory;
    @Autowired EntityManager entityManager;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("공개 동아리 상세의 쿼리 수는 모집 이력 수와 무관하게 상수이고, 대표 모집 표시는 기존과 같다")
    void detailQueryCountIsConstantRegardlessOfRecruitmentHistory() throws Exception {
        Club smallClub = saveActiveClub("상세쿼리소");
        Recruitment smallOpen = saveOpenRecruitment(smallClub, LocalDate.now().minusDays(3), null);

        Club bigClub = saveActiveClub("상세쿼리대");
        // OPEN 은 클럽당 1건 제약 — 이력은 CLOSED 로 쌓는다. close UPDATE 를 flush 해 다음 INSERT 와의
        // uk_recruitment_club_active 충돌을 막는다(Hibernate 기본 액션 순서 INSERT→UPDATE).
        for (int i = 0; i < 19; i++) {
            Recruitment closed = saveOpenRecruitment(
                    bigClub, LocalDate.now().minusWeeks(i + 2), LocalDate.now().minusWeeks(i + 2).plusDays(3));
            closed.close(LocalDateTime.now());
            recruitmentRepository.flush();
        }
        Recruitment bigOpen = saveOpenRecruitment(bigClub, LocalDate.now().minusDays(1), null);
        entityManager.flush();
        entityManager.clear();

        Statistics statistics = statistics();
        // 워밍업 — 세션 최초 쿼리의 1회성 준비 비용을 계측에서 배제한다.
        clubService.getActiveById(smallClub.getId(), ClubViewer.anonymous());

        entityManager.clear();
        long beforeSmall = statistics.getPrepareStatementCount();
        ClubDetailQuery smallDetail = clubService.getActiveById(smallClub.getId(), ClubViewer.anonymous());
        long smallQueries = statistics.getPrepareStatementCount() - beforeSmall;

        entityManager.clear();
        long beforeBig = statistics.getPrepareStatementCount();
        ClubDetailQuery bigDetail = clubService.getActiveById(bigClub.getId(), ClubViewer.anonymous());
        long bigQueries = statistics.getPrepareStatementCount() - beforeBig;

        // 이력 1건과 20건의 쿼리 수가 같다 = 대표 모집 경로에 행당·엔티티발 추가 쿼리(form eager) 없음.
        assertThat(bigQueries).isEqualTo(smallQueries);
        // club 조회 + 사진 + 대표 모집 projection + 리더 조회 = 상수 범위.
        assertThat(smallQueries).isLessThanOrEqualTo(4);

        // 대표 모집 표시가 엔티티 경로와 동일한지 고정 — 진행 중(상시모집)이 이력보다 우선(#895 규칙).
        assertThat(smallDetail.activeRecruitment().id()).isEqualTo(smallOpen.getId());
        assertThat(bigDetail.activeRecruitment().id()).isEqualTo(bigOpen.getId());
        assertThat(bigDetail.activeRecruitment().displayStatus()).isEqualTo(RecruitmentDisplayStatus.ALWAYS_OPEN);
        // showApplicantCount=false(기본) 인 모집은 지원자 수를 노출하지 않는다(count 쿼리도 없어야 함).
        assertThat(bigDetail.activeRecruitment().applicantCount()).isNull();
    }

    private Statistics statistics() {
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        return statistics;
    }

    private Recruitment saveOpenRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        return recruitmentRepository.save(
                Recruitment.create(club, "모집-" + sequence.getAndIncrement(), "내용", startDate, endDate, 10));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
