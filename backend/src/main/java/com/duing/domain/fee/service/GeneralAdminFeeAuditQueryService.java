package com.duing.domain.fee.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.fee.entity.BankMatchingSetting;
import com.duing.domain.fee.entity.FeeAccount;
import com.duing.domain.fee.entity.FeeAuditCommentKind;
import com.duing.domain.fee.entity.FeeAuditCommentStatus;
import com.duing.domain.fee.entity.PaymentStatus;
import com.duing.domain.fee.repository.AdminFeeAuditCommentRepository;
import com.duing.domain.fee.repository.AdminFeeAuditQueryRepository;
import com.duing.domain.fee.repository.AdminFeeBillAggregate;
import com.duing.domain.fee.repository.AdminFeeClubBasics;
import com.duing.domain.fee.repository.AdminFeePaymentAggregate;
import com.duing.domain.fee.repository.BankMatchingSettingRepository;
import com.duing.domain.fee.repository.FeeAccountRepository;
import com.duing.domain.fee.service.dto.query.AdminFeeAccountQuery;
import com.duing.domain.fee.service.dto.query.AdminFeeAuditLogRow;
import com.duing.domain.fee.service.dto.query.AdminFeeBillFilter;
import com.duing.domain.fee.service.dto.query.AdminFeeBillRow;
import com.duing.domain.fee.service.dto.query.AdminFeeBillSort;
import com.duing.domain.fee.service.dto.query.AdminFeeClubDetailQuery;
import com.duing.domain.fee.service.dto.query.AdminFeeClubRow;
import com.duing.domain.fee.service.dto.query.AdminFeeClubSort;
import com.duing.domain.fee.service.dto.query.AdminFeeDashboardQuery;
import com.duing.domain.fee.service.dto.query.AdminFeeKpiProjection;
import com.duing.domain.fee.service.dto.query.AdminFeePaymentRow;
import com.duing.domain.fee.service.dto.query.AdminFeePeriod;
import com.duing.domain.fee.service.dto.query.AdminFeePolicyRow;
import com.duing.domain.fee.service.dto.query.AdminFeeUsageFilter;
import com.duing.domain.fee.support.AccountNumberMasker;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.crypto.FeeAccountCipher;
import java.text.Collator;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 총동연(ADMIN) 회비 감사 조회. 권한은 컨트롤러의 {@code @PreAuthorize} 와 URL 레이어 백스톱이 담당하므로
 * 운영진 가드({@code requireManager})는 호출하지 않는다 — admin 은 전 동아리 접근이 정당하다
 * (선례: {@code GeneralAdminApplicationQueryService}).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralAdminFeeAuditQueryService implements AdminFeeAuditQueryService {

    /**
     * 이 콘솔이 싣는 이벤트 종류 — 회비 감사라 FEE_* 만 대상이고 가입 링크·모집 이벤트는 남의 도메인이다(스펙 §7.8).
     * 접두사로 뽑으므로 새 FEE_ 값이 늘어도 여기를 고칠 필요가 없다.
     */
    private static final Set<ClubAuditEventType> FEE_EVENT_TYPES = Arrays.stream(ClubAuditEventType.values())
            .filter(eventType -> eventType.name().startsWith("FEE_"))
            .collect(Collectors.toUnmodifiableSet());

    /**
     * 대시보드 최근 변경 요약이 세는 이벤트 — 총동연 열람 2종은 아무것도 바꾸지 않아 뺀다.
     * 판정 기준은 이상징후(FA-06)와 같은 {@code isFeeMutation} 하나를 쓴다.
     */
    private static final Set<ClubAuditEventType> FEE_MUTATION_TYPES = FEE_EVENT_TYPES.stream()
            .filter(ClubAuditEventType::isFeeMutation)
            .collect(Collectors.toUnmodifiableSet());

    private final AdminFeeAuditQueryRepository adminFeeAuditQueryRepository;
    private final ClubRepository clubRepository;
    private final UserRepository userRepository;
    private final BankMatchingSettingRepository bankMatchingSettingRepository;
    private final ClubAuditEventRepository clubAuditEventRepository;
    private final AdminFeeAuditCommentRepository adminFeeAuditCommentRepository;
    private final FeeAccountRepository feeAccountRepository;
    private final AccountNumberMasker accountNumberMasker;
    private final FeeAccountCipher feeAccountCipher;
    private final Clock clock;

    @Override
    public Page<AdminFeeClubRow> searchClubs(String q, AdminFeeUsageFilter usage, AdminFeePeriod period,
                                             AdminFeeClubSort sort, Pageable pageable) {
        List<AdminFeeClubRow> matchedRows = mergeRows(q, period).stream()
                .filter(row -> matchesUsage(row, usage))
                .sorted(comparatorOf(sort))
                .toList();
        // ponytail: 메모리 정렬·페이징. 정렬 키가 집계값이라 SQL 페이징을 하려면 집계를 단일 쿼리로 합쳐야 하는데,
        // 동아리 수백 규모(스펙 §10)에서는 이 편이 싸고 읽기 쉽다. 동아리 수천 규모가 되면 집계 정렬 쿼리로 이관.
        int fromIndex = (int) Math.min(pageable.getOffset(), matchedRows.size());
        int toIndex = Math.min(fromIndex + pageable.getPageSize(), matchedRows.size());
        return new PageImpl<>(matchedRows.subList(fromIndex, toIndex), pageable, matchedRows.size());
    }

    @Override
    public AdminFeeDashboardQuery getDashboard(AdminFeePeriod period) {
        List<AdminFeeClubRow> allRows = mergeRows(null, period);
        long totalBilled = allRows.stream().mapToLong(AdminFeeClubRow::totalBilled).sum();
        long totalPaid = allRows.stream().mapToLong(AdminFeeClubRow::totalPaid).sum();
        return new AdminFeeDashboardQuery(
                allRows.size(),
                allRows.stream().filter(AdminFeeClubRow::feeUsing).count(),
                totalBilled,
                totalPaid,
                totalBilled - totalPaid,
                collectionRate(totalBilled, totalPaid),
                adminFeeAuditCommentRepository.countByStatus(FeeAuditCommentStatus.OPEN),
                recentActivity());
    }

    /**
     * 오늘의 변경 요약(스펙 §7.2) — 기준선은 전역 기간 필터와 무관하게 KST 오늘 00:00 이다.
     * 경계는 created_at 과 같은 JVM 존 벽시계여야 해 {@code AdminFeePeriod} 의 환산을 그대로 쓴다
     * (KST 벽시계를 그대로 넘기면 prod(JVM=UTC)에서 창이 9시간 어긋난다).
     */
    private AdminFeeDashboardQuery.RecentActivity recentActivity() {
        LocalDate today = LocalDate.now(clock);
        LocalDateTime since = AdminFeePeriod.of(today, today).createdFrom();
        Map<String, Long> eventCounts = clubAuditEventRepository
                .countEventsByTypeSince(FEE_MUTATION_TYPES, since).entrySet().stream()
                .collect(Collectors.toMap(countByType -> countByType.getKey().name(), Map.Entry::getValue));
        return new AdminFeeDashboardQuery.RecentActivity(
                since,
                eventCounts,
                adminFeeAuditCommentRepository.countByKindAndCreatedAtGreaterThanEqual(
                        FeeAuditCommentKind.AUDIT_OPINION, since));
    }

    /**
     * 열람 감사를 같은 트랜잭션에 남기므로 조회지만 쓰기 트랜잭션이다 — readOnly 로 두면 실제 PG 에서
     * INSERT 가 거부된다. 목록·대시보드는 동아리 단위 재무 요약만 보므로 감사 대상이 아니다(스펙 §15 결정 5).
     */
    @Override
    @Transactional
    public AdminFeeClubDetailQuery getClubDetail(Long clubId, AdminFeePeriod period, Long adminUserId) {
        Club targetClub = clubRepository.findById(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);
        clubAuditEventRepository.save(ClubAuditEvent.feeAdminView(clubId, adminUserId));

        AdminFeeKpiProjection billKpi =
                adminFeeAuditQueryRepository.summarizeClub(clubId, period, LocalDate.now(clock));
        AdminFeeBillAggregate billAggregate = adminFeeAuditQueryRepository.aggregateBills(period, clubId)
                .getOrDefault(clubId, AdminFeeBillAggregate.EMPTY);
        AdminFeePaymentAggregate paymentAggregate = adminFeeAuditQueryRepository
                .aggregatePayments(period, clubId).getOrDefault(clubId, AdminFeePaymentAggregate.EMPTY);
        boolean bankMatchingActive = bankMatchingSettingRepository.findByClubId(clubId)
                .map(BankMatchingSetting::isUsable)
                .orElse(false);

        return new AdminFeeClubDetailQuery(
                targetClub.getId(), targetClub.getName(), targetClub.getStatus(),
                adminFeeAuditQueryRepository.countMembers(clubId).getOrDefault(clubId, 0L),
                adminFeeAuditQueryRepository.countActivePolicies(clubId).getOrDefault(clubId, 0L),
                billKpi.billCount(), billKpi.paidCount(), billKpi.unpaidCount(),
                billKpi.overdueCount(), billKpi.cancelledCount(),
                billAggregate.totalBilled(), paymentAggregate.totalPaid(),
                billAggregate.totalBilled() - paymentAggregate.totalPaid(),
                collectionRate(billAggregate.totalBilled(), paymentAggregate.totalPaid()),
                bankMatchingActive);
    }

    @Override
    public List<AdminFeePolicyRow> getPolicies(Long clubId, AdminFeePeriod period) {
        requireExistingClub(clubId);
        return adminFeeAuditQueryRepository.findPoliciesForAdmin(clubId, period);
    }

    /** 연체 판정 기준일(KST 오늘)은 서비스가 소유한다 — 필터와 응답 플래그가 같은 기준일을 쓰도록 한 번만 읽는다. */
    @Override
    public Page<AdminFeeBillRow> searchBills(Long clubId, AdminFeeBillFilter filter, String q,
                                             AdminFeePeriod period, AdminFeeBillSort sort, Pageable pageable) {
        requireExistingClub(clubId);
        return adminFeeAuditQueryRepository.searchBillsForAdmin(
                clubId, filter, q, period, LocalDate.now(clock), sort, pageable);
    }

    @Override
    public Page<AdminFeePaymentRow> searchPayments(Long clubId, PaymentStatus status, AdminFeePeriod period,
                                                   Pageable pageable) {
        requireExistingClub(clubId);
        return adminFeeAuditQueryRepository.searchPaymentsForAdmin(clubId, status, period, pageable);
    }

    /** 계좌는 열람 전용이다 — 평문 계좌번호는 응답에 실리지 않고 마스킹 값만 나간다(스펙 §7.7). */
    @Override
    public AdminFeeAccountQuery getAccount(Long clubId) {
        requireExistingClub(clubId);
        return feeAccountRepository.findByClubId(clubId)
                .map(account -> new AdminFeeAccountQuery(
                        true,
                        account.getBank(),
                        maskSafely(account),
                        account.getAccountHolder(),
                        bankMatchingSettingRepository.findByClubId(clubId)
                                .map(BankMatchingSetting::isUsable)
                                .orElse(false)))
                .orElseGet(AdminFeeAccountQuery::notRegistered);
    }

    /**
     * 회비 변경 이력(스펙 §7.8) — 조회 전용이라 열람 감사를 남기지 않는다(상세 진입에서 이미 1건 남았다).
     * 응답 순서는 리포지토리가 최신순으로 고정한다.
     */
    @Override
    public Page<AdminFeeAuditLogRow> getAuditLogs(Long clubId, List<ClubAuditEventType> types,
                                                  AdminFeePeriod period, Pageable pageable) {
        requireExistingClub(clubId);
        Page<ClubAuditEvent> events = clubAuditEventRepository.searchFeeEvents(
                clubId, feeTypesOf(types), period.createdFrom(), period.createdTo(), pageable);
        Map<Long, String> actorNames = actorNamesOf(events.getContent());
        return events.map(event -> toLogRow(event, actorNames));
    }

    /** 요청 종류와 회비 이벤트의 교집합. 생략하면 전체이고, 회비 밖 종류는 400 이 아니라 조용히 빠진다(스펙 §7.8). */
    private static Collection<ClubAuditEventType> feeTypesOf(List<ClubAuditEventType> requestedTypes) {
        if (requestedTypes == null || requestedTypes.isEmpty()) {
            return FEE_EVENT_TYPES;
        }
        return requestedTypes.stream().filter(FEE_EVENT_TYPES::contains).distinct().toList();
    }

    /** actor 이름은 한 번에 모아 해석한다 — 행마다 조회하면 페이지 크기만큼 쿼리가 늘어난다(N+1). */
    private Map<Long, String> actorNamesOf(List<ClubAuditEvent> events) {
        return userRepository.findAllById(
                        events.stream().map(ClubAuditEvent::getActorUserId).distinct().toList()).stream()
                .collect(Collectors.toMap(User::getId, User::getName, (first, second) -> first));
    }

    /** 탈퇴(soft delete) 회원이 actor 면 이름을 찾을 수 없다 — 행은 감사 이력이라 남기고 이름만 비운다. */
    private static AdminFeeAuditLogRow toLogRow(ClubAuditEvent event, Map<Long, String> actorNames) {
        return new AdminFeeAuditLogRow(
                event.getId(),
                event.getEventType(),
                event.getActorUserId(),
                actorNames.get(event.getActorUserId()),
                event.getCreatedAt(),
                event.getReason(),
                event.getFeePolicyId(),
                event.getFeeBillId(),
                event.getPaymentId(),
                event.getBankTransactionId(),
                event.getDetail());
    }

    /**
     * 계좌번호를 복호화해 끝 4자리만 남긴다. 복호화 실패(키 회전·AAD 불일치·암호문 손상)는 화면 전체를 죽이지 않고
     * 그 값만 비운다(graceful degrade, {@code GeneralBankMatchingAdminService} 선례).
     * 평문·암호문·키는 절대 로깅하지 않는다.
     */
    private String maskSafely(FeeAccount account) {
        try {
            return accountNumberMasker.mask(
                    feeAccountCipher.decrypt(account.getAccountNumber(), account.getClubId()));
        } catch (IllegalArgumentException | IllegalStateException decryptFailure) {
            log.warn("회비 감사 계좌 복호화 실패 — 해당 값 마스킹 생략: clubId={}",
                    account.getClubId(), decryptFailure);
            return null;
        }
    }

    /**
     * 하위 탭 4종 공통 가드 — 없는(또는 삭제된) 동아리는 빈 결과가 아니라 404 다(스펙 §7.11).
     * 상세 KPI 는 Club 엔티티 자체가 필요해 findById 로 조회하지만, 여기서는 존재 여부만 보면 된다.
     */
    private void requireExistingClub(Long clubId) {
        if (!clubRepository.existsById(clubId)) {
            throw new ClubException.ClubNotFoundException();
        }
    }

    /** 테이블별 집계 소쿼리 6개를 clubId 로 병합한다(스펙 §10). */
    private List<AdminFeeClubRow> mergeRows(String q, AdminFeePeriod period) {
        Map<Long, AdminFeeBillAggregate> billsByClub = adminFeeAuditQueryRepository.aggregateBills(period, null);
        Map<Long, AdminFeePaymentAggregate> paymentsByClub =
                adminFeeAuditQueryRepository.aggregatePayments(period, null);
        Map<Long, Long> unpaidMembersByClub = adminFeeAuditQueryRepository.countUnpaidMembers(period);
        Map<Long, Long> activePoliciesByClub = adminFeeAuditQueryRepository.countActivePolicies(null);
        Map<Long, Long> membersByClub = adminFeeAuditQueryRepository.countMembers(null);
        Map<Long, Instant> lastTransactionByClub = adminFeeAuditQueryRepository.findLastTransactionAt();

        return adminFeeAuditQueryRepository.findClubs(q).stream()
                .map(clubBasics -> toRow(clubBasics,
                        billsByClub.getOrDefault(clubBasics.clubId(), AdminFeeBillAggregate.EMPTY),
                        paymentsByClub.getOrDefault(clubBasics.clubId(), AdminFeePaymentAggregate.EMPTY),
                        unpaidMembersByClub.getOrDefault(clubBasics.clubId(), 0L),
                        activePoliciesByClub.getOrDefault(clubBasics.clubId(), 0L),
                        membersByClub.getOrDefault(clubBasics.clubId(), 0L),
                        lastTransactionByClub.get(clubBasics.clubId())))
                .toList();
    }

    private AdminFeeClubRow toRow(AdminFeeClubBasics clubBasics, AdminFeeBillAggregate billAggregate,
                                  AdminFeePaymentAggregate paymentAggregate, long unpaidMemberCount,
                                  long activePolicyCount, long memberCount, Instant lastTransactionAt) {
        return new AdminFeeClubRow(
                clubBasics.clubId(), clubBasics.clubName(), clubBasics.clubStatus(),
                // 회비 사용 판정 = 활성 정책 ≥1 또는 청구 이력 ≥1 (스펙 §15 결정 7).
                // 계좌만 등록한 동아리는 감사할 데이터가 없어 미사용으로 본다.
                activePolicyCount > 0 || billAggregate.billCount() > 0,
                activePolicyCount, memberCount,
                billAggregate.billCount(), billAggregate.totalBilled(), paymentAggregate.totalPaid(),
                billAggregate.totalBilled() - paymentAggregate.totalPaid(),
                unpaidMemberCount, paymentAggregate.lastPaidAt(), lastTransactionAt);
    }

    private static boolean matchesUsage(AdminFeeClubRow row, AdminFeeUsageFilter usage) {
        if (usage == null) {
            return true;
        }
        return row.feeUsing() == (usage == AdminFeeUsageFilter.USING);
    }

    private static Comparator<AdminFeeClubRow> comparatorOf(AdminFeeClubSort sort) {
        // Collator 는 내부 상태를 갖는 비교기라 공유 상수로 두지 않고 정렬마다 새로 만든다.
        Collator koreanCollator = Collator.getInstance(Locale.KOREAN);
        Comparator<AdminFeeClubRow> primaryOrder = switch (sort) {
            case OUTSTANDING -> Comparator.comparingLong(AdminFeeClubRow::outstanding).reversed();
            case BILLED -> Comparator.comparingLong(AdminFeeClubRow::totalBilled).reversed();
            case COLLECTED -> Comparator.comparingLong(AdminFeeClubRow::totalPaid).reversed();
            // 납부 이력이 없는 동아리는 최근순의 끝으로 보낸다.
            case RECENT_PAYMENT -> Comparator.comparing(AdminFeeClubRow::lastPaidAt,
                    Comparator.nullsLast(Comparator.reverseOrder()));
            case NAME -> Comparator.comparing(AdminFeeClubRow::clubName, koreanCollator);
        };
        // 집계값 동률에서 페이지 간 순서가 흔들리지 않도록 id 로 고정한다.
        return primaryOrder.thenComparing(AdminFeeClubRow::clubId);
    }

    /** 수납률(%). 청구가 없으면 분모가 0 이라 0.0 으로 고정하고, 소수 첫째 자리까지 내린다. */
    private static double collectionRate(long totalBilled, long totalPaid) {
        if (totalBilled <= 0) {
            return 0.0;
        }
        return Math.round(totalPaid * 1000.0 / totalBilled) / 10.0;
    }
}
