package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.query.RecruitmentSummaryQuery;
import com.duing.global.config.PublicApiCacheConfig;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

/**
 * 공개 모집 조회(캘린더·클럽별 목록)의 요청당 쿼리 수 회귀 테스트.
 *
 * <p>RecruitmentForm 이 mappedBy @OneToOne 이라 바이트코드 강화 없이는 사실상 eager 다 —
 * 엔티티로 목록을 읽으면 행마다 form 단건 SELECT(+questions jsonb)가 나가고, 요약 조립이 club
 * 프록시를 초기화하며 full Club 까지 로드해 쿼리 수가 모집 수 N 에 비례했다(2026-08 성능 감사 P0-3).
 * 공개 읽기 경로를 스칼라 projection 으로 전환한 뒤에는 쿼리 수가 N 과 무관한 상수여야 한다.
 *
 * <p>계측은 {@code ClubMemberQueryServiceTest} 의 Hibernate Statistics 전례를 따르고,
 * 시드 엔티티가 영속성 컨텍스트에 남아 지연 로딩을 숨기지 않도록 측정 전에 clear 한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class RecruitmentPublicQueryCountTest {

    @Autowired RecruitmentService recruitmentService;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired EntityManagerFactory entityManagerFactory;
    @Autowired EntityManager entityManager;
    @Autowired ObjectProvider<PublicApiCacheConfig> publicApiCacheConfig;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void evictPublicCaches() {
        // 캘린더가 앱 마이크로 캐시(P1-5) 대상이라, 같은 컨텍스트의 다른 테스트가 남긴 엔트리가
        // 캐시 히트(0쿼리)로 이 계측을 오염시킬 수 있다 — 항상 miss 에서 시작하도록 비운다.
        publicApiCacheConfig.ifAvailable(PublicApiCacheConfig::evictAllOnTtlElapsed);
    }

    // 시한폭탄 금지 — 절대 날짜 대신 상대 월. 서로 다른 달을 써서 두 데이터셋을 격리한다.
    private final YearMonth smallMonth = YearMonth.from(LocalDate.now()).minusMonths(2);
    private final YearMonth bigMonth = YearMonth.from(LocalDate.now()).minusMonths(1);

    @Test
    @DisplayName("공개 모집 캘린더 조회의 쿼리 수는 해당 월 모집 수와 무관하게 상수다")
    void calendarQueryCountIsConstant() throws Exception {
        seedClubWithRecruitmentIn(smallMonth);
        for (int i = 0; i < 20; i++) {
            seedClubWithRecruitmentIn(bigMonth);
        }
        entityManager.flush();
        entityManager.clear();

        Statistics statistics = statistics();
        // 워밍업: 세션 최초 쿼리의 1회성 준비 비용을 계측에서 배제한다.
        recruitmentService.getCalendar(YearMonth.from(LocalDate.now()).minusMonths(6));

        long beforeSmall = statistics.getPrepareStatementCount();
        List<RecruitmentSummaryQuery> smallResult = recruitmentService.getCalendar(smallMonth);
        long smallQueries = statistics.getPrepareStatementCount() - beforeSmall;

        entityManager.clear();
        long beforeBig = statistics.getPrepareStatementCount();
        List<RecruitmentSummaryQuery> bigResult = recruitmentService.getCalendar(bigMonth);
        long bigQueries = statistics.getPrepareStatementCount() - beforeBig;

        assertThat(smallResult).hasSize(1);
        assertThat(bigResult).hasSize(20);
        // 모집 1건과 20건의 쿼리 수가 같다 = 행당 추가 쿼리(form eager·club 프록시) 없음.
        assertThat(bigQueries).isEqualTo(smallQueries);
        // projection 단일 SELECT 로 상수 범위에 머문다.
        assertThat(smallQueries).isLessThanOrEqualTo(1);
    }

    @Test
    @DisplayName("클럽별 공개 모집 목록의 쿼리 수는 모집 이력 수와 무관하게 상수이고, 정렬·요약 값은 기존과 같다")
    void clubRecruitmentsQueryCountIsConstantAndSummaryUnchanged() throws Exception {
        Club smallClub = saveActiveClub("모집쿼리소");
        saveOpenRecruitment(smallClub, bigMonth.atDay(1), null);

        Club bigClub = saveActiveClub("모집쿼리대");
        // OPEN 은 클럽당 1건 제약(uk_recruitment_club_active) — 이력은 CLOSED 로 쌓는다.
        // close UPDATE 가 다음 INSERT 보다 먼저 DB 에 가도록 매 건 flush (Hibernate 기본 액션 순서는 INSERT→UPDATE).
        for (int i = 0; i < 19; i++) {
            Recruitment closed = saveOpenRecruitment(
                    bigClub, bigMonth.atDay(1).minusWeeks(i + 1), bigMonth.atDay(1).minusWeeks(i + 1).plusDays(3));
            closed.close(LocalDateTime.now());
            recruitmentRepository.flush();
        }
        Recruitment open = saveOpenRecruitment(bigClub, bigMonth.atDay(2), null);
        entityManager.flush();
        entityManager.clear();

        Statistics statistics = statistics();
        recruitmentService.getByClubId(smallClub.getId());

        entityManager.clear();
        long beforeBig = statistics.getPrepareStatementCount();
        List<RecruitmentSummaryQuery> bigResult = recruitmentService.getByClubId(bigClub.getId());
        long bigQueries = statistics.getPrepareStatementCount() - beforeBig;

        entityManager.clear();
        long beforeSmall = statistics.getPrepareStatementCount();
        List<RecruitmentSummaryQuery> smallResult = recruitmentService.getByClubId(smallClub.getId());
        long smallQueries = statistics.getPrepareStatementCount() - beforeSmall;

        assertThat(smallResult).hasSize(1);
        assertThat(bigResult).hasSize(20);
        assertThat(bigQueries).isEqualTo(smallQueries);
        // 공개 가시성 게이트 1 + projection 1.
        assertThat(smallQueries).isLessThanOrEqualTo(2);

        // 요약 값·정렬이 엔티티 경로와 동일한지 고정 — OPEN 우선, 그 안은 startDate 내림차순.
        RecruitmentSummaryQuery first = bigResult.get(0);
        assertThat(first.id()).isEqualTo(open.getId());
        assertThat(first.status()).isEqualTo(RecruitmentStatus.OPEN);
        assertThat(first.displayStatus()).isEqualTo(RecruitmentDisplayStatus.ALWAYS_OPEN);
        assertThat(first.effectivelyOpen()).isTrue();
        assertThat(first.clubName()).isEqualTo(bigClub.getName());
        List<RecruitmentSummaryQuery> closedRows = bigResult.subList(1, bigResult.size());
        assertThat(closedRows).allSatisfy(summary -> {
            assertThat(summary.status()).isEqualTo(RecruitmentStatus.CLOSED);
            assertThat(summary.displayStatus()).isEqualTo(RecruitmentDisplayStatus.CLOSED);
            assertThat(summary.effectivelyOpen()).isFalse();
        });
        assertThat(closedRows).extracting(RecruitmentSummaryQuery::startDate)
                .isSortedAccordingTo(java.util.Comparator.reverseOrder());
    }

    private Statistics statistics() {
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        return statistics;
    }

    private void seedClubWithRecruitmentIn(YearMonth month) throws Exception {
        Club club = saveActiveClub("캘린더쿼리");
        saveOpenRecruitment(club, month.atDay(5), month.atDay(20));
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
