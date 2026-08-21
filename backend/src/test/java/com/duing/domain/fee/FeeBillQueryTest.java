package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.FeeBillFixture;
import com.duing.common.fixture.FeePolicyFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.service.dto.query.BillSearchQuery;
import com.duing.domain.fee.service.dto.query.FeeBillQuery;
import com.duing.domain.fee.service.dto.query.MyFeeSearchQuery;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@DisplayName("FeeBill QueryDSL 동적 필터/페이지네이션")
class FeeBillQueryTest extends IntegrationTestBase {

    // 리포지토리에 넘기는 '오늘'. status 필터가 표기 축이라 마감 경과 여부로 결과가 갈리므로,
    // 아래 픽스처(2026-07 이후 회차)의 마감보다 앞선 날짜로 고정해 필터 결과를 결정적으로 만든다.
    private static final LocalDate TODAY = LocalDate.of(2026, 6, 15);

    @Autowired
    UserRepository userRepository;
    @Autowired
    ClubRepository clubRepository;
    @Autowired
    FeePolicyRepository feePolicyRepository;
    @Autowired
    FeeBillRepository feeBillRepository;

    private Long clubId;
    private Long policyId;

    @BeforeEach
    void setUp() {
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, 10000L));
        policyId = policy.getId();
    }

    private Long saveUserId() {
        return userRepository.save(UserFixture.unique()).getId();
    }

    private FeeBill saveBill(Long clubIdValue, Long userId, String period, FeeStatus status) {
        return saveBill(clubIdValue, policyId, userId, period, status);
    }

    private FeeBill saveBill(Long clubIdValue, Long policyIdValue, Long userId, String period, FeeStatus status) {
        return feeBillRepository.save(FeeBillFixture.withStatus(clubIdValue, userId, policyIdValue, period, status));
    }

    @Test
    @DisplayName("필터가 없으면 해당 동아리의 모든 청구를 반환한다")
    void noFilterReturnsAllClubBills() {
        Long userA = saveUserId();
        Long userB = saveUserId();
        Long userC = saveUserId();
        saveBill(clubId, userA, "2026-07", FeeStatus.PENDING);
        saveBill(clubId, userB, "2026-07", FeeStatus.PENDING);
        // 다른 동아리 청구는 제외돼야 한다
        Club other = clubRepository.save(ClubFixture.academic("동아리B"));
        saveBill(other.getId(), userC, "2026-07", FeeStatus.PENDING);

        Page<FeeBill> page = feeBillRepository.searchClubBills(
                clubId, new BillSearchQuery(null, null, null), TODAY, PageRequest.of(0, 20));

        assertThat(page.getTotalElements()).isEqualTo(2L);
        assertThat(page.getContent()).allMatch(bill -> bill.getClubId().equals(clubId));
    }

    @Test
    @DisplayName("billingPeriod 필터로 해당 회차의 청구만 반환한다")
    void filterByBillingPeriod() {
        Long userA = saveUserId();
        Long userB = saveUserId();
        saveBill(clubId, userA, "2026-07", FeeStatus.PENDING);
        saveBill(clubId, userB, "2026-08", FeeStatus.PENDING);

        Page<FeeBill> page = feeBillRepository.searchClubBills(
                clubId, new BillSearchQuery("2026-07", null, null), TODAY, PageRequest.of(0, 20));

        assertThat(page.getTotalElements()).isEqualTo(1L);
        assertThat(page.getContent()).allMatch(bill -> bill.getBillingPeriod().equals("2026-07"));
    }

    @Test
    @DisplayName("status 필터로 해당 상태의 청구만 반환한다")
    void filterByStatus() {
        Long userA = saveUserId();
        Long userB = saveUserId();
        saveBill(clubId, userA, "2026-07", FeeStatus.PENDING);
        saveBill(clubId, userB, "2026-07", FeeStatus.CANCELLED);

        Page<FeeBill> pending = feeBillRepository.searchClubBills(
                clubId, new BillSearchQuery(null, FeeStatus.PENDING, null), TODAY, PageRequest.of(0, 20));
        Page<FeeBill> cancelled = feeBillRepository.searchClubBills(
                clubId, new BillSearchQuery(null, FeeStatus.CANCELLED, null), TODAY, PageRequest.of(0, 20));

        assertThat(pending.getTotalElements()).isEqualTo(1L);
        assertThat(pending.getContent()).allMatch(bill -> bill.getStatus() == FeeStatus.PENDING);
        assertThat(cancelled.getTotalElements()).isEqualTo(1L);
        assertThat(cancelled.getContent()).allMatch(bill -> bill.getStatus() == FeeStatus.CANCELLED);
    }

    @Test
    @DisplayName("userId 필터로 해당 회원의 청구만 반환한다")
    void filterByUserId() {
        Long userA = saveUserId();
        Long userB = saveUserId();
        saveBill(clubId, userA, "2026-07", FeeStatus.PENDING);
        saveBill(clubId, userB, "2026-07", FeeStatus.PENDING);

        Page<FeeBill> page = feeBillRepository.searchClubBills(
                clubId, new BillSearchQuery(null, null, userA), TODAY, PageRequest.of(0, 20));

        assertThat(page.getTotalElements()).isEqualTo(1L);
        assertThat(page.getContent()).allMatch(bill -> bill.getUserId().equals(userA));
    }

    @Test
    @DisplayName("여러 필터를 함께 적용하면 모두 만족하는 청구만 반환한다")
    void filterByMultipleConditions() {
        Long userA = saveUserId();
        Long userB = saveUserId();
        saveBill(clubId, userA, "2026-07", FeeStatus.PENDING);
        saveBill(clubId, userA, "2026-08", FeeStatus.PENDING);   // 회차 불일치
        saveBill(clubId, userB, "2026-07", FeeStatus.PENDING);   // 회원 불일치
        saveBill(clubId, userA, "2026-07", FeeStatus.CANCELLED); // 상태 불일치(같은 회차여도 CANCELLED 라 유니크 인덱스 제외)

        Page<FeeBill> page = feeBillRepository.searchClubBills(
                clubId, new BillSearchQuery("2026-07", FeeStatus.PENDING, userA), TODAY, PageRequest.of(0, 20));

        assertThat(page.getTotalElements()).isEqualTo(1L);
        FeeBill only = page.getContent().get(0);
        assertThat(only.getUserId()).isEqualTo(userA);
        assertThat(only.getBillingPeriod()).isEqualTo("2026-07");
        assertThat(only.getStatus()).isEqualTo(FeeStatus.PENDING);
    }

    @Test
    @DisplayName("페이지네이션은 page/size 로 정확히 잘라 totalElements 와 hasNext 를 산출한다")
    void paginationSlicesCorrectly() {
        for (int index = 0; index < 25; index++) {
            saveBill(clubId, saveUserId(), "2026-07", FeeStatus.PENDING);
        }

        Pageable firstPage = PageRequest.of(0, 10);
        Page<FeeBill> page0 = feeBillRepository.searchClubBills(
                clubId, new BillSearchQuery(null, null, null), TODAY, firstPage);
        Page<FeeBill> page2 = feeBillRepository.searchClubBills(
                clubId, new BillSearchQuery(null, null, null), TODAY, PageRequest.of(2, 10));

        assertThat(page0.getTotalElements()).isEqualTo(25L);
        assertThat(page0.getContent()).hasSize(10);
        assertThat(page0.getTotalPages()).isEqualTo(3);
        assertThat(page0.hasNext()).isTrue();
        // 마지막 페이지(2)는 5건만 남고 다음 페이지 없음
        assertThat(page2.getContent()).hasSize(5);
        assertThat(page2.hasNext()).isFalse();
    }

    @Test
    @DisplayName("soft delete 된 청구는 조회에서 제외된다(@SQLRestriction 이 QueryDSL 에도 적용된다)")
    void softDeletedBillsExcluded() {
        Long userA = saveUserId();
        Long userB = saveUserId();
        saveBill(clubId, userA, "2026-07", FeeStatus.PENDING);
        FeeBill toDelete = saveBill(clubId, userB, "2026-07", FeeStatus.PENDING);
        feeBillRepository.delete(toDelete); // @SQLDelete soft delete (deleted_at = NOW())

        Page<FeeBill> clubBills = feeBillRepository.searchClubBills(
                clubId, new BillSearchQuery(null, null, null), TODAY, PageRequest.of(0, 20));
        List<FeeBill> myBills = feeBillRepository.searchMyBills(userB, new MyFeeSearchQuery(null, null), TODAY);

        // 운영진 청구 현황·회원 본인 조회 모두 soft-delete 행을 제외해야 한다
        assertThat(clubBills.getTotalElements()).isEqualTo(1L);
        assertThat(clubBills.getContent()).allMatch(bill -> bill.getUserId().equals(userA));
        assertThat(myBills).isEmpty();
    }

    @Test
    @DisplayName("FeeBillQuery 는 저장 status 를 그대로 두고 주입한 today 기준으로 표기 상태(displayStatus)를 파생한다")
    void fromDerivesDisplayStatusFromGivenToday() {
        // 청구액 10000, 마감 2026-07-31(픽스처가 회차 말일에서 파생), 저장 status = PENDING
        FeeBill bill = saveBill(clubId, saveUserId(), "2026-07", FeeStatus.PENDING);
        LocalDate dayAfterDue = LocalDate.of(2026, 8, 1);

        FeeBillQuery unpaidAfterDue = FeeBillQuery.from(bill, 0L, dayAfterDue);
        FeeBillQuery fullyPaidAfterDue = FeeBillQuery.from(bill, 10000L, dayAfterDue);
        FeeBillQuery unpaidBeforeDue = FeeBillQuery.from(bill, 0L, LocalDate.of(2026, 7, 31));

        // 저장 축은 어떤 today 에도 건드리지 않는다
        assertThat(unpaidAfterDue.status()).isEqualTo(FeeStatus.PENDING);
        assertThat(fullyPaidAfterDue.status()).isEqualTo(FeeStatus.PENDING);
        // 표기 축만 today·납부 합계로 갈린다 — 마감 당일까지는 정상, 익일부터 연체, 완납은 최우선
        assertThat(unpaidBeforeDue.displayStatus()).isEqualTo(FeeStatus.PENDING);
        assertThat(unpaidAfterDue.displayStatus()).isEqualTo(FeeStatus.OVERDUE);
        assertThat(fullyPaidAfterDue.displayStatus()).isEqualTo(FeeStatus.PAID);
    }

    @Test
    @DisplayName("내 회비 조회는 본인 user_id 의 청구만 반환하고 clubId/status 옵션 필터로 좁힌다")
    void searchMyBillsScopesToUserAndFilters() {
        Long userA = saveUserId();
        Long userB = saveUserId();
        Club other = clubRepository.save(ClubFixture.academic("동아리B"));
        // clubB 는 별도 정책을 둬 (fee_policy_id, user_id, billing_start_date) 유니크 인덱스가 clubA 회차와 충돌하지 않게 한다.
        Long otherPolicyId = feePolicyRepository.save(
                FeePolicyFixture.of(other.getId(), BillingType.MONTHLY, 20000L)).getId();
        saveBill(clubId, userA, "2026-07", FeeStatus.PENDING);                       // 본인, clubA, PENDING
        saveBill(other.getId(), otherPolicyId, userA, "2026-07", FeeStatus.PENDING); // 본인, clubB
        saveBill(clubId, userA, "2026-08", FeeStatus.CANCELLED);                     // 본인, clubA, CANCELLED
        saveBill(clubId, userB, "2026-07", FeeStatus.PENDING);                       // 타인

        List<FeeBill> mineAll = feeBillRepository.searchMyBills(userA, new MyFeeSearchQuery(null, null), TODAY);
        List<FeeBill> mineClubA = feeBillRepository.searchMyBills(userA, new MyFeeSearchQuery(clubId, null), TODAY);
        List<FeeBill> minePending = feeBillRepository.searchMyBills(userA, new MyFeeSearchQuery(null, FeeStatus.PENDING), TODAY);

        assertThat(mineAll).hasSize(3).allMatch(bill -> bill.getUserId().equals(userA));
        assertThat(mineClubA).hasSize(2).allMatch(bill -> bill.getClubId().equals(clubId));
        assertThat(minePending).hasSize(2).allMatch(bill -> bill.getStatus() == FeeStatus.PENDING);
    }
}
