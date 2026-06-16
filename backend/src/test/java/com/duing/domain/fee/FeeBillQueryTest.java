package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.service.dto.query.BillSearchQuery;
import com.duing.domain.fee.service.dto.query.MyFeeSearchQuery;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
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

    @Autowired
    UserRepository userRepository;
    @Autowired
    ClubRepository clubRepository;
    @Autowired
    FeePolicyRepository feePolicyRepository;
    @Autowired
    FeeBillRepository feeBillRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Long clubId;
    private Long policyId;

    @BeforeEach
    void setUp() {
        Club club = clubRepository.save(Club.create("동아리A", ClubCategory.ACADEMIC, null, "설명", null));
        clubId = club.getId();
        FeePolicy policy = feePolicyRepository.save(FeePolicy.create(clubId, "회비", 10000L, BillingType.MONTHLY));
        policyId = policy.getId();
    }

    private Long saveUserId() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now())).getId();
    }

    private FeeBill saveBill(Long clubIdValue, Long userId, String period, FeeStatus status) {
        return saveBill(clubIdValue, policyId, userId, period, status);
    }

    private FeeBill saveBill(Long clubIdValue, Long policyIdValue, Long userId, String period, FeeStatus status) {
        // billingStartDate 를 "YYYY-MM" 회차에서 파생해 (fee_policy_id, user_id, billing_start_date) 유니크
        // 인덱스가 회차별로 달라지게 한다(같은 회원에게 여러 회차를 저장해도 충돌 없음).
        LocalDate start = LocalDate.parse(period + "-01");
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        FeeBill bill = FeeBill.issue(clubIdValue, userId, policyIdValue, 10000L, period, start, end, end);
        if (status == FeeStatus.CANCELLED) {
            bill.cancel();
        }
        return feeBillRepository.save(bill);
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
        Club other = clubRepository.save(Club.create("동아리B", ClubCategory.ACADEMIC, null, "설명", null));
        saveBill(other.getId(), userC, "2026-07", FeeStatus.PENDING);

        Page<FeeBill> page = feeBillRepository.searchClubBills(
                clubId, new BillSearchQuery(null, null, null), PageRequest.of(0, 20));

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
                clubId, new BillSearchQuery("2026-07", null, null), PageRequest.of(0, 20));

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
                clubId, new BillSearchQuery(null, FeeStatus.PENDING, null), PageRequest.of(0, 20));
        Page<FeeBill> cancelled = feeBillRepository.searchClubBills(
                clubId, new BillSearchQuery(null, FeeStatus.CANCELLED, null), PageRequest.of(0, 20));

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
                clubId, new BillSearchQuery(null, null, userA), PageRequest.of(0, 20));

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
                clubId, new BillSearchQuery("2026-07", FeeStatus.PENDING, userA), PageRequest.of(0, 20));

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
                clubId, new BillSearchQuery(null, null, null), firstPage);
        Page<FeeBill> page2 = feeBillRepository.searchClubBills(
                clubId, new BillSearchQuery(null, null, null), PageRequest.of(2, 10));

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
                clubId, new BillSearchQuery(null, null, null), PageRequest.of(0, 20));
        List<FeeBill> myBills = feeBillRepository.searchMyBills(userB, new MyFeeSearchQuery(null, null));

        // 운영진 청구 현황·회원 본인 조회 모두 soft-delete 행을 제외해야 한다
        assertThat(clubBills.getTotalElements()).isEqualTo(1L);
        assertThat(clubBills.getContent()).allMatch(bill -> bill.getUserId().equals(userA));
        assertThat(myBills).isEmpty();
    }

    @Test
    @DisplayName("내 회비 조회는 본인 user_id 의 청구만 반환하고 clubId/status 옵션 필터로 좁힌다")
    void searchMyBillsScopesToUserAndFilters() {
        Long userA = saveUserId();
        Long userB = saveUserId();
        Club other = clubRepository.save(Club.create("동아리B", ClubCategory.ACADEMIC, null, "설명", null));
        // clubB 는 별도 정책을 둬 (fee_policy_id, user_id, billing_start_date) 유니크 인덱스가 clubA 회차와 충돌하지 않게 한다.
        Long otherPolicyId = feePolicyRepository.save(
                FeePolicy.create(other.getId(), "회비", 20000L, BillingType.MONTHLY)).getId();
        saveBill(clubId, userA, "2026-07", FeeStatus.PENDING);                       // 본인, clubA, PENDING
        saveBill(other.getId(), otherPolicyId, userA, "2026-07", FeeStatus.PENDING); // 본인, clubB
        saveBill(clubId, userA, "2026-08", FeeStatus.CANCELLED);                     // 본인, clubA, CANCELLED
        saveBill(clubId, userB, "2026-07", FeeStatus.PENDING);                       // 타인

        List<FeeBill> mineAll = feeBillRepository.searchMyBills(userA, new MyFeeSearchQuery(null, null));
        List<FeeBill> mineClubA = feeBillRepository.searchMyBills(userA, new MyFeeSearchQuery(clubId, null));
        List<FeeBill> minePending = feeBillRepository.searchMyBills(userA, new MyFeeSearchQuery(null, FeeStatus.PENDING));

        assertThat(mineAll).hasSize(3).allMatch(bill -> bill.getUserId().equals(userA));
        assertThat(mineClubA).hasSize(2).allMatch(bill -> bill.getClubId().equals(clubId));
        assertThat(minePending).hasSize(2).allMatch(bill -> bill.getStatus() == FeeStatus.PENDING);
    }
}
