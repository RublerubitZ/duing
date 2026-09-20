package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.Bank;
import com.duing.domain.fee.exception.FeeAccountException;
import com.duing.domain.fee.service.FeeAccountService;
import com.duing.domain.fee.service.dto.command.UpsertFeeAccountCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 계좌가 아직 없는 동아리에 두 운영진이 동시에 첫 등록을 시도하는 경합을 실스레드로 재현한다.
 * upsert 는 멱등 PUT 이라 사전 검증으로 걸러낼 중복이 없고, 선조회를 함께 통과한 두 INSERT 중
 * 하나는 부분 유니크(uk_fee_account_club)에 걸린다 — 그 패배분이 미분류 generic 이 아니라
 * 도메인 경합 409 계약으로 표면화되는지 고정한다.
 *
 * <p>경합 자체는 배리어로 강제할 수 없어 시도를 반복하고, 끝내 관측되지 않으면 skip 한다.
 * 배리어는 서비스 호출 "시작"만 맞출 뿐이라, 러너 부하로 한쪽이 선점당한 사이 다른 쪽이
 * 선조회→INSERT→커밋을 끝내면 뒤늦게 선조회한 쪽은 기존 행을 보고 update(멱등 PUT) 경로로 새어
 * 둘 다 성공한다 — 선조회 창이 겹치지 않아 경합 자체가 없었던 것이지 제품 결함이 아니다.
 * 그래서 경합이 관측된 시도에 대해서만 409 계약(contract 1·2)을 단언하고, 순서와 무관하게 성립해야 하는
 * 활성 계좌 1행 계약(contract 3)은 경합 관측 여부와 무관하게 매 시도 단언한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FeeAccountConcurrencyTest extends IntegrationTestBase {

    /** 첫 등록 경합을 관측하기 위한 최대 시도 횟수(로컬에서는 보통 첫 시도에 잡힌다). */
    private static final int MAX_RACE_ATTEMPTS = 5;

    @Autowired FeeAccountService feeAccountService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("두 운영진이 동시에 회비 계좌를 처음 등록하면 한 건만 성공하고 나머지는 경합 409 로 표면화된다")
    void concurrentFirstRegistrationsLeaveExactlyOneAccount() throws Exception {
        for (int attempt = 1; attempt <= MAX_RACE_ATTEMPTS; attempt++) {
            // 활성 계좌 부분 유니크는 동아리 단위라 시도마다 새 동아리·새 운영진 2명으로 다시 건다.
            List<Throwable> failures = raceFirstRegistration("회비계좌동시등록동아리" + attempt);

            // 경합 재현 여부와 무관한 제품 결함 — 어느 순서로 끝나든 한 건은 반드시 성공해야 한다.
            assertThat(failures).as("두 등록이 모두 실패하면 안 된다(%d번째 시도)", attempt).hasSizeLessThan(2);
            if (failures.isEmpty()) {
                continue; // 선조회 구간이 겹치지 않아 경합 없이 둘 다 성공 — 다시 건다.
            }
            // 핵심 contract 1·2: 정확히 한 건만 실패했고, 그 패배분은 미분류 DB 오류가 아니라 도메인 경합 409 다.
            assertThat(failures.get(0)).as("경합 패배분의 표면화 형태")
                    .isInstanceOf(FeeAccountException.ConcurrentRegistrationException.class);
            return;
        }
        Assumptions.assumeTrue(false, MAX_RACE_ATTEMPTS
                + "회 시도에서 첫 등록 경합이 재현되지 않음 — 러너 스케줄링 문제이지 제품 결함이 아니다");
    }

    /**
     * 새 동아리·운영진 2명을 만들어 두 upsert 를 배리어로 맞춰 던지고 실패분을 돌려준다.
     * 활성 계좌 1행 계약(contract 3)은 경합 관측 여부와 무관하게 성립해야 하므로 여기서 매번 단언한다.
     */
    private List<Throwable> raceFirstRegistration(String clubName) throws Exception {
        Club club = clubRepository.save(ClubFixture.academic(clubName));
        User leader = userRepository.save(UserFixture.unique());
        User officer = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        // 운영 행위 게이트(requireManager)는 ACTIVE 동아리만 통과시킨다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", club.getId());

        // 두 스레드를 서비스 호출 직전에 맞춰 선조회 구간이 겹칠 확률을 높인다(먼저 끝난 쪽을 뒤늦게 보면
        // update 경로로 새어 경합이 재현되지 않는다 — 그 시도는 호출 측이 다시 건다).
        CyclicBarrier startTogether = new CyclicBarrier(2);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        Callable<Throwable> byLeader = () -> tryUpsert(startTogether, new UpsertFeeAccountCommand(
                club.getId(), leader.getId(), Bank.KB, "111-111-111", "회장등록"));
        Callable<Throwable> byOfficer = () -> tryUpsert(startTogether, new UpsertFeeAccountCommand(
                club.getId(), officer.getId(), Bank.TOSS, "222-222-222", "운영진등록"));

        List<Future<Throwable>> outcomes = pool.invokeAll(List.of(byLeader, byOfficer));
        pool.shutdown();
        assertThat(pool.awaitTermination(15, TimeUnit.SECONDS))
                .as("동시 등록 테스트가 시간 내에 완료").isTrue();

        // 핵심 contract 3: 활성 계좌 행은 1건만 남는다.
        Long activeAccountCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM fee_account WHERE club_id = ? AND deleted_at IS NULL",
                Long.class, club.getId());
        assertThat(activeAccountCount).as("활성 회비 계좌는 1건만 존재").isEqualTo(1L);

        return outcomes.stream().map(this::quietGet).filter(Objects::nonNull).toList();
    }

    private Throwable tryUpsert(CyclicBarrier startTogether, UpsertFeeAccountCommand command) {
        try {
            startTogether.await(10, TimeUnit.SECONDS);
            feeAccountService.upsert(command);
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private Throwable quietGet(Future<Throwable> future) {
        try {
            return future.get(10, TimeUnit.SECONDS);
        } catch (Exception executionFailure) {
            return executionFailure;
        }
    }
}
