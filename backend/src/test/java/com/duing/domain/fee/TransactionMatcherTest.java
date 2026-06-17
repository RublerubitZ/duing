package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.FeePolicyFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.BankTransaction;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.entity.TransactionType;
import com.duing.domain.fee.repository.BankTransactionRepository;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.service.TransactionMatcher;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class TransactionMatcherTest extends IntegrationTestBase {

    @Autowired
    UserRepository userRepository;
    @Autowired
    ClubRepository clubRepository;
    @Autowired
    ClubMemberRepository clubMemberRepository;
    @Autowired
    FeePolicyRepository feePolicyRepository;
    @Autowired
    FeeBillRepository feeBillRepository;
    @Autowired
    BankTransactionRepository bankTransactionRepository;
    @Autowired
    TransactionMatcher transactionMatcher;

    private Club club;
    private Long clubId;
    private Long policyId;
    private Long actorId;

    @BeforeEach
    void setUp() {
        club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, 10000L));
        policyId = policy.getId();

        User leader = userRepository.save(UserFixture.unique());
        actorId = leader.getId();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
    }

    /** 회원 1명을 동아리에 가입시키고 저장된 User 를 반환한다(이름은 UserFixture 기본값). */
    private User joinMember() {
        User member = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));
        return member;
    }

    /** 지정한 이름으로 회원 1명을 동아리에 가입시키고 저장된 User 를 반환한다(Tier 2 이름 매칭용). */
    private User joinMemberNamed(String name) {
        User member = userRepository.save(UserFixture.withName(name));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));
        return member;
    }

    /** 해당 회원에게 "YYYY-MM" 회차로 미납 청구 1건을 발행한다(마감일은 회차 말일). */
    private FeeBill saveBill(Long userId, long amount, String period) {
        LocalDate start = LocalDate.parse(period + "-01");
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        return feeBillRepository.save(
                FeeBill.issue(clubId, userId, policyId, amount, period, start, end, end));
    }

    /** 입금 거래 1건을 적재한다(은행코드·입금자명 지정 — Tier 1/2 분기 검증용). */
    private BankTransaction saveDeposit(String bankCode, long amount, String counterparty) {
        return bankTransactionRepository.save(BankTransaction.ingest(
                clubId, bankCode, LocalDateTime.of(2026, 6, 10, 9, 0), amount, 100000L, counterparty,
                TransactionType.DEPOSIT, "hash-" + bankCode + "-" + amount + "-" + System.nanoTime(), "{}"));
    }

    private FeeStatus billStatus(Long billId) {
        return feeBillRepository.findById(billId).orElseThrow().getStatus();
    }

    private MatchStatus txStatus(Long txId) {
        return bankTransactionRepository.findById(txId).orElseThrow().getMatchStatus();
    }

    @Test
    @DisplayName("잔액이 입금액과 정확히 일치하는 미납 청구가 1건이면 자동매칭된다(청구 PAID, 거래 AUTO_MATCHED)")
    void singleCandidateAutoMatches() {
        User member = joinMember();
        FeeBill bill = saveBill(member.getId(), 10000L, "2026-07");
        BankTransaction tx = saveDeposit("NH", 10000L, "홍길동");

        boolean matched = transactionMatcher.tryAutoMatch(tx, actorId);

        assertThat(matched).isTrue();
        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.PAID);
        BankTransaction reloaded = bankTransactionRepository.findById(tx.getId()).orElseThrow();
        assertThat(reloaded.getMatchStatus()).isEqualTo(MatchStatus.AUTO_MATCHED);
        assertThat(reloaded.getMatchedFeeBillId()).isEqualTo(bill.getId());
    }

    @Test
    @DisplayName("후보가 2건이고 KB 가 아닌 은행이면 자동매칭하지 않고 거래는 PENDING 으로 남는다")
    void twoCandidatesNonKbStaysPending() {
        User memberOne = joinMember();
        User memberTwo = joinMember();
        saveBill(memberOne.getId(), 10000L, "2026-07");
        saveBill(memberTwo.getId(), 10000L, "2026-08");
        BankTransaction tx = saveDeposit("NH", 10000L, "홍길동"); // 비KB → 이름 보조 미적용

        boolean matched = transactionMatcher.tryAutoMatch(tx, actorId);

        assertThat(matched).isFalse();
        assertThat(txStatus(tx.getId())).isEqualTo(MatchStatus.PENDING);
    }

    @Test
    @DisplayName("후보가 2건이고 KB 이면서 입금자명이 한 회원의 이름과 일치하면 이름으로 1건 좁혀 자동매칭한다")
    void twoCandidatesKbDisambiguatedByName() {
        User target = joinMemberNamed("김철수");
        User other = joinMemberNamed("이영희");
        FeeBill targetBill = saveBill(target.getId(), 10000L, "2026-07");
        saveBill(other.getId(), 10000L, "2026-08");
        BankTransaction tx = saveDeposit("KB", 10000L, "김철수"); // KB + 이름 일치 1건

        boolean matched = transactionMatcher.tryAutoMatch(tx, actorId);

        assertThat(matched).isTrue();
        assertThat(billStatus(targetBill.getId())).isEqualTo(FeeStatus.PAID);
        BankTransaction reloaded = bankTransactionRepository.findById(tx.getId()).orElseThrow();
        assertThat(reloaded.getMatchStatus()).isEqualTo(MatchStatus.AUTO_MATCHED);
        assertThat(reloaded.getMatchedFeeBillId()).isEqualTo(targetBill.getId());
    }

    @Test
    @DisplayName("후보가 2건이고 KB 이며 입금자명에 공백이 섞여 있어도 공백 정규화 후 회원 이름과 1건 일치하면 자동매칭한다")
    void twoCandidatesKbWhitespaceNormalizedByName() {
        User target = joinMemberNamed("김철수");
        User other = joinMemberNamed("이영희");
        FeeBill targetBill = saveBill(target.getId(), 10000L, "2026-07");
        saveBill(other.getId(), 10000L, "2026-08");
        BankTransaction tx = saveDeposit("KB", 10000L, "김 철 수"); // 공백 → 정규화 후 "김철수" 1건 일치

        boolean matched = transactionMatcher.tryAutoMatch(tx, actorId);

        assertThat(matched).isTrue();
        assertThat(billStatus(targetBill.getId())).isEqualTo(FeeStatus.PAID);
        BankTransaction reloaded = bankTransactionRepository.findById(tx.getId()).orElseThrow();
        assertThat(reloaded.getMatchStatus()).isEqualTo(MatchStatus.AUTO_MATCHED);
        assertThat(reloaded.getMatchedFeeBillId()).isEqualTo(targetBill.getId());
    }

    @Test
    @DisplayName("후보가 2건이고 KB 이지만 동명이인으로 이름이 2명 일치하면 1건으로 좁혀지지 않아 자동매칭하지 않는다")
    void twoCandidatesKbHomonymStaysPending() {
        User sameNameOne = joinMemberNamed("김철수");
        User sameNameTwo = joinMemberNamed("김철수"); // 동명이인
        saveBill(sameNameOne.getId(), 10000L, "2026-07");
        saveBill(sameNameTwo.getId(), 10000L, "2026-08");
        BankTransaction tx = saveDeposit("KB", 10000L, "김철수"); // 이름 일치 2건 → 모호

        boolean matched = transactionMatcher.tryAutoMatch(tx, actorId);

        assertThat(matched).isFalse();
        assertThat(txStatus(tx.getId())).isEqualTo(MatchStatus.PENDING);
    }

    @Test
    @DisplayName("잔액이 입금액과 일치하는 미납 청구 후보가 0건이면 자동매칭하지 않고 거래는 PENDING 으로 남는다")
    void noCandidateStaysPending() {
        User member = joinMember();
        saveBill(member.getId(), 10000L, "2026-07");
        BankTransaction tx = saveDeposit("NH", 7000L, "홍길동"); // 어떤 청구 잔액과도 불일치

        boolean matched = transactionMatcher.tryAutoMatch(tx, actorId);

        assertThat(matched).isFalse();
        assertThat(txStatus(tx.getId())).isEqualTo(MatchStatus.PENDING);
    }
}
