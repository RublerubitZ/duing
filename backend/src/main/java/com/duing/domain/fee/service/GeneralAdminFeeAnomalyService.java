package com.duing.domain.fee.service;

import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.fee.repository.AdminFeeAuditQueryRepository;
import com.duing.domain.fee.repository.AdminFeeMatchAggregate;
import com.duing.domain.fee.repository.AdminFeeVoidedPaymentDue;
import com.duing.domain.fee.service.dto.query.AdminFeePeriod;
import com.duing.domain.fee.service.dto.query.FeeAnomaly;
import com.duing.domain.fee.service.dto.query.FeeAnomalyReport;
import com.duing.domain.fee.service.dto.query.FeeAnomalySeverity;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 회비 이상징후 Rule 평가(스펙 §5.1). Rule 엔진·인터페이스 추상화는 두지 않는다 —
 * Rule 하나가 "쿼리 하나 + 임계 비교"라 private 메서드 8개로 충분하다(스펙 §15 결정 6).
 *
 * <p>윈도우는 두 갈래다. 일반 Rule 은 요청 기간(생략 시 최근 30일)을 그대로 쓰고,
 * 버스트 Rule(FA-05 7일·FA-06 24시간)은 짧은 고유 윈도우가 판정 정의의 일부라 기간과 무관하게
 * 현재 기준으로 평가한다. FA-08 은 계좌 교체가 드문 사건이라 기간이 짧아도 90일까지 넓혀 본다.
 *
 * <p>이중 임계(FA-01·02·04·06)는 높은 심각도부터 판정해 하나만 남긴다 — 같은 사실을 두 줄로 보고하지 않는다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralAdminFeeAnomalyService implements AdminFeeAnomalyService {

    // ponytail: 임계값 하드코딩 — P2 배치 도입 때 프로퍼티로 승격(스펙 §5.2).
    private static final double MANUAL_RATIO_WARNING = 0.60;   // FA-01
    private static final long MANUAL_MIN_WARNING = 5;
    private static final double MANUAL_RATIO_HIGH = 0.80;
    private static final long MANUAL_MIN_HIGH = 10;
    private static final long VOID_WARNING = 3;                // FA-02
    private static final long VOID_HIGH = 8;
    private static final double CANCEL_RATIO_WARNING = 0.20;   // FA-03
    private static final long CANCEL_MIN = 5;
    private static final long LATE_VOID_INFO = 1;              // FA-04
    private static final long LATE_VOID_WARNING = 3;
    private static final long ACTOR_BURST_HIGH = 5;            // FA-05, 7일 고정
    private static final long EVENT_BURST_HIGH = 20;           // FA-06, 24h 고정
    private static final long EVENT_BURST_CRITICAL = 50;
    private static final long POLICY_AMOUNT_CHANGES_WARNING = 3; // FA-07
    private static final long ACCOUNT_CHANGES_CRITICAL = 2;    // FA-08, 윈도우 하한 90일

    private static final int DEFAULT_WINDOW_DAYS = 30;
    private static final int ACTOR_BURST_WINDOW_DAYS = 7;
    private static final int EVENT_BURST_WINDOW_HOURS = 24;
    private static final int ACCOUNT_WINDOW_MIN_DAYS = 90;

    /**
     * FA-06 대상 — 회비 데이터를 바꾸는 이벤트. 총동연 열람 2종은 아무것도 바꾸지 않는데
     * 감사자가 화면을 오래 들여다보기만 해도 "대량 변경"으로 잡히므로 뺀다.
     */
    private static final Set<ClubAuditEventType> FEE_MUTATION_TYPES = Arrays.stream(ClubAuditEventType.values())
            .filter(eventType -> eventType.name().startsWith("FEE_"))
            .filter(eventType -> eventType != ClubAuditEventType.FEE_ADMIN_DETAIL_VIEWED
                    && eventType != ClubAuditEventType.FEE_ADMIN_CSV_DOWNLOADED)
            .collect(Collectors.toUnmodifiableSet());

    /** FA-05 대상 — 되돌리기·수정 성격의 변경 3종(스펙 §5.1). 발행·납부 기록 같은 정상 운영은 세지 않는다. */
    private static final Set<ClubAuditEventType> ACTOR_REPEAT_TYPES = Set.of(
            ClubAuditEventType.FEE_PAYMENT_VOIDED,
            ClubAuditEventType.FEE_BILL_CANCELLED,
            ClubAuditEventType.FEE_POLICY_UPDATED);

    /** FA-08 대상 — 수납 계좌가 바뀌거나 사라진 사건. 최초 등록은 교체가 아니라 뺀다. */
    private static final Set<ClubAuditEventType> ACCOUNT_CHANGE_TYPES = Set.of(
            ClubAuditEventType.FEE_ACCOUNT_UPDATED,
            ClubAuditEventType.FEE_ACCOUNT_DELETED);

    /**
     * ponytail: FA-07 이 훑을 정책 수정 이벤트 상한. 한 동아리가 기간 내 이만큼 정책을 고쳤다면
     * 이미 FA-06 이 잡고 있고 FA-07 판정도 진작 넘긴 뒤라, 더 읽어도 결론이 바뀌지 않는다.
     */
    private static final int POLICY_EVENT_SCAN_LIMIT = 500;

    private final AdminFeeAuditQueryRepository adminFeeAuditQueryRepository;
    private final ClubAuditEventRepository clubAuditEventRepository;
    private final ClubRepository clubRepository;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Override
    public FeeAnomalyReport evaluate(Long clubId, LocalDate from, LocalDate to) {
        requireExistingClub(clubId);
        LocalDate windowTo = to != null ? to : LocalDate.now(clock);
        LocalDate windowFrom = from != null ? from : windowTo.minusDays(DEFAULT_WINDOW_DAYS);
        AdminFeePeriod period = AdminFeePeriod.of(windowFrom, windowTo);
        // 고정 윈도우의 기준 시각. created_at 은 JPA 감사 필드라 JVM 존 벽시계이므로 같은 존으로 환산한다 —
        // seoulClock 의 벽시계(LocalDateTime.now(clock))를 그대로 쓰면 prod(JVM=UTC)에서 창이 9시간 어긋난다.
        LocalDateTime nowInSystemZone = LocalDateTime.ofInstant(clock.instant(), ZoneId.systemDefault());
        // FA-02·FA-04 는 같은 행 집합을 보므로 한 번만 읽어 두 Rule 에 나눠 준다.
        List<AdminFeeVoidedPaymentDue> voidedPayments =
                adminFeeAuditQueryRepository.findVoidedPaymentDues(clubId, period);

        List<FeeAnomaly> detectedAnomalies = Stream.of(
                        detectManualMatchRatio(clubId, period),
                        detectVoidedPayments(voidedPayments),
                        detectCancelledBills(clubId, period),
                        detectLateVoids(voidedPayments),
                        detectActorRepeat(clubId, nowInSystemZone),
                        detectEventBurst(clubId, nowInSystemZone),
                        detectPolicyAmountChanges(clubId, period),
                        detectAccountChanges(clubId, windowFrom, windowTo))
                .flatMap(Optional::stream)
                // 심각한 것부터. 정렬이 안정적이라 같은 심각도끼리는 Rule 번호순이 유지된다.
                .sorted(Comparator.comparing(FeeAnomaly::severity, Comparator.reverseOrder()))
                .toList();

        return new FeeAnomalyReport(clock.instant(), windowFrom, windowTo, detectedAnomalies);
    }

    /**
     * FA-01 수동 매칭 비율 과다. 분모는 매칭 완료(자동+수동) 거래이고 최소 건수도 분모 기준이다 —
     * 표본이 작으면 비율이 아무리 높아도 침묵한다(거래 2건 중 2건 수동은 사고가 아니라 일상이다).
     */
    private Optional<FeeAnomaly> detectManualMatchRatio(Long clubId, AdminFeePeriod period) {
        AdminFeeMatchAggregate matchAggregate =
                adminFeeAuditQueryRepository.countMatchedTransactions(clubId, period);
        if (matchAggregate.matchedCount() == 0) {
            return Optional.empty();
        }
        double manualRatio = (double) matchAggregate.manualCount() / matchAggregate.matchedCount();
        if (manualRatio >= MANUAL_RATIO_HIGH && matchAggregate.matchedCount() >= MANUAL_MIN_HIGH) {
            return Optional.of(manualMatchAnomaly(FeeAnomalySeverity.HIGH, matchAggregate, manualRatio,
                    MANUAL_RATIO_HIGH, MANUAL_MIN_HIGH));
        }
        if (manualRatio >= MANUAL_RATIO_WARNING && matchAggregate.matchedCount() >= MANUAL_MIN_WARNING) {
            return Optional.of(manualMatchAnomaly(FeeAnomalySeverity.WARNING, matchAggregate, manualRatio,
                    MANUAL_RATIO_WARNING, MANUAL_MIN_WARNING));
        }
        return Optional.empty();
    }

    private static FeeAnomaly manualMatchAnomaly(FeeAnomalySeverity severity,
                                                 AdminFeeMatchAggregate matchAggregate, double manualRatio,
                                                 double thresholdRatio, long thresholdMatchedCount) {
        return new FeeAnomaly("FA-01", severity, "수동 매칭 비율 과다",
                "기간 내 매칭 거래 %d건 중 수동 매칭 %d건 (%.1f%%, 기준 %.0f%%·%d건)".formatted(
                        matchAggregate.matchedCount(), matchAggregate.manualCount(),
                        percent(manualRatio), percent(thresholdRatio), thresholdMatchedCount),
                Map.of("matchedCount", matchAggregate.matchedCount(),
                        "manualCount", matchAggregate.manualCount(),
                        "manualRatioPercent", percent(manualRatio),
                        "thresholdRatioPercent", percent(thresholdRatio),
                        "thresholdMatchedCount", thresholdMatchedCount));
    }

    /** FA-02 납부 정정(VOID) 과다 — 정정 시각이 기간에 든 납부를 센다(납부 시점이 아니다). */
    private static Optional<FeeAnomaly> detectVoidedPayments(List<AdminFeeVoidedPaymentDue> voidedPayments) {
        long voidCount = voidedPayments.size();
        if (voidCount >= VOID_HIGH) {
            return Optional.of(voidAnomaly(FeeAnomalySeverity.HIGH, voidCount, VOID_HIGH));
        }
        if (voidCount >= VOID_WARNING) {
            return Optional.of(voidAnomaly(FeeAnomalySeverity.WARNING, voidCount, VOID_WARNING));
        }
        return Optional.empty();
    }

    private static FeeAnomaly voidAnomaly(FeeAnomalySeverity severity, long voidCount, long threshold) {
        return new FeeAnomaly("FA-02", severity, "납부 정정(VOID) 과다",
                "기간 내 납부 정정 %d건 (기준 %d건)".formatted(voidCount, threshold),
                Map.of("voidCount", voidCount, "threshold", threshold));
    }

    /**
     * FA-03 청구 취소 과다. 취소 건수와 발행 대비 비율을 함께 본다 —
     * 취소 시각은 updated_at 근사라(리포지토리 주석) 발행과 취소가 다른 기간에 걸치면 비율이 100% 를 넘을 수 있다.
     */
    private Optional<FeeAnomaly> detectCancelledBills(Long clubId, AdminFeePeriod period) {
        long cancelledCount = adminFeeAuditQueryRepository.countCancelledBills(clubId, period);
        if (cancelledCount < CANCEL_MIN) {
            return Optional.empty();
        }
        long issuedCount = adminFeeAuditQueryRepository.countIssuedBills(clubId, period);
        if (issuedCount == 0) {
            return Optional.empty();
        }
        double cancelRatio = (double) cancelledCount / issuedCount;
        if (cancelRatio < CANCEL_RATIO_WARNING) {
            return Optional.empty();
        }
        return Optional.of(new FeeAnomaly("FA-03", FeeAnomalySeverity.WARNING, "청구 취소 과다",
                "기간 내 청구 취소 %d건 / 발행 %d건 (%.1f%%, 기준 %.0f%%·%d건)".formatted(
                        cancelledCount, issuedCount, percent(cancelRatio),
                        percent(CANCEL_RATIO_WARNING), CANCEL_MIN),
                Map.of("cancelledCount", cancelledCount,
                        "issuedCount", issuedCount,
                        "cancelRatioPercent", percent(cancelRatio),
                        "thresholdRatioPercent", percent(CANCEL_RATIO_WARNING),
                        "thresholdCancelledCount", CANCEL_MIN)));
    }

    /** FA-04 마감 후 정정 — 마감 당일 정정은 아직 경과가 아니라 세지 않는다(연체 판정과 같은 기준). */
    private static Optional<FeeAnomaly> detectLateVoids(List<AdminFeeVoidedPaymentDue> voidedPayments) {
        long lateVoidCount = voidedPayments.stream().filter(AdminFeeVoidedPaymentDue::isAfterDueDate).count();
        if (lateVoidCount >= LATE_VOID_WARNING) {
            return Optional.of(lateVoidAnomaly(FeeAnomalySeverity.WARNING, lateVoidCount, LATE_VOID_WARNING));
        }
        if (lateVoidCount >= LATE_VOID_INFO) {
            return Optional.of(lateVoidAnomaly(FeeAnomalySeverity.INFO, lateVoidCount, LATE_VOID_INFO));
        }
        return Optional.empty();
    }

    private static FeeAnomaly lateVoidAnomaly(FeeAnomalySeverity severity, long lateVoidCount, long threshold) {
        return new FeeAnomaly("FA-04", severity, "마감 후 정정",
                "기간 내 마감 후 납부 정정 %d건 (기준 %d건)".formatted(lateVoidCount, threshold),
                Map.of("lateVoidCount", lateVoidCount, "threshold", threshold));
    }

    /**
     * FA-05 동일 운영진 반복 변경 — 최근 7일 고정 윈도우.
     * 누가 그랬는지는 감사 로그 화면이 답할 몫이라 이 응답에는 건수만 싣는다.
     */
    private Optional<FeeAnomaly> detectActorRepeat(Long clubId, LocalDateTime nowInSystemZone) {
        long maxActorEventCount = clubAuditEventRepository.findMaxEventCountByActorSince(
                clubId, ACTOR_REPEAT_TYPES, nowInSystemZone.minusDays(ACTOR_BURST_WINDOW_DAYS));
        if (maxActorEventCount < ACTOR_BURST_HIGH) {
            return Optional.empty();
        }
        return Optional.of(new FeeAnomaly("FA-05", FeeAnomalySeverity.HIGH, "동일 운영진 반복 변경",
                "동일 운영진의 최근 %d일 회비 변경 %d건 (기준 %d건)".formatted(
                        ACTOR_BURST_WINDOW_DAYS, maxActorEventCount, ACTOR_BURST_HIGH),
                Map.of("maxActorEventCount", maxActorEventCount,
                        "threshold", ACTOR_BURST_HIGH,
                        "windowDays", ACTOR_BURST_WINDOW_DAYS)));
    }

    /** FA-06 단시간 대량 변경 — 최근 24시간 고정 윈도우. 총동연 열람은 변경이 아니라 세지 않는다. */
    private Optional<FeeAnomaly> detectEventBurst(Long clubId, LocalDateTime nowInSystemZone) {
        long mutationCount = clubAuditEventRepository.countEventsSince(
                clubId, FEE_MUTATION_TYPES, nowInSystemZone.minusHours(EVENT_BURST_WINDOW_HOURS));
        if (mutationCount >= EVENT_BURST_CRITICAL) {
            return Optional.of(eventBurstAnomaly(FeeAnomalySeverity.CRITICAL, mutationCount,
                    EVENT_BURST_CRITICAL));
        }
        if (mutationCount >= EVENT_BURST_HIGH) {
            return Optional.of(eventBurstAnomaly(FeeAnomalySeverity.HIGH, mutationCount, EVENT_BURST_HIGH));
        }
        return Optional.empty();
    }

    private static FeeAnomaly eventBurstAnomaly(FeeAnomalySeverity severity, long mutationCount,
                                                long threshold) {
        return new FeeAnomaly("FA-06", severity, "단시간 대량 변경",
                "최근 %d시간 회비 변경 %d건 (기준 %d건)".formatted(
                        EVENT_BURST_WINDOW_HOURS, mutationCount, threshold),
                Map.of("mutationCount", mutationCount,
                        "threshold", threshold,
                        "windowHours", EVENT_BURST_WINDOW_HOURS));
    }

    /**
     * FA-07 정책 금액 급변 — 기간 내 같은 정책의 금액 변경 횟수.
     * 이름·마감일만 고친 수정은 detail 에 amount 스냅샷이 없어 빠진다.
     */
    private Optional<FeeAnomaly> detectPolicyAmountChanges(Long clubId, AdminFeePeriod period) {
        List<ClubAuditEvent> policyUpdates = clubAuditEventRepository.searchFeeEvents(
                clubId, Set.of(ClubAuditEventType.FEE_POLICY_UPDATED),
                period.createdFrom(), period.createdTo(),
                PageRequest.of(0, POLICY_EVENT_SCAN_LIMIT)).getContent();
        long maxAmountChanges = policyUpdates.stream()
                .filter(event -> event.getFeePolicyId() != null)
                .filter(this::hasAmountChange)
                .collect(Collectors.groupingBy(ClubAuditEvent::getFeePolicyId, Collectors.counting()))
                .values().stream()
                .mapToLong(Long::longValue)
                .max()
                .orElse(0L);
        if (maxAmountChanges < POLICY_AMOUNT_CHANGES_WARNING) {
            return Optional.empty();
        }
        return Optional.of(new FeeAnomaly("FA-07", FeeAnomalySeverity.WARNING, "정책 금액 급변",
                "기간 내 동일 정책 금액 변경 %d회 (기준 %d회)".formatted(
                        maxAmountChanges, POLICY_AMOUNT_CHANGES_WARNING),
                Map.of("maxAmountChanges", maxAmountChanges, "threshold", POLICY_AMOUNT_CHANGES_WARNING)));
    }

    /**
     * FA-08 계좌 빈번 교체 — 기간이 90일보다 짧으면 90일로 넓혀 본다.
     * 계좌 교체는 드문 사건이라 최근 30일만 보면 "두 달 전에 두 번 갈아탄" 수납 경로 변조를 놓친다.
     */
    private Optional<FeeAnomaly> detectAccountChanges(Long clubId, LocalDate windowFrom, LocalDate windowTo) {
        LocalDate minimumFrom = windowTo.minusDays(ACCOUNT_WINDOW_MIN_DAYS);
        LocalDate accountFrom = windowFrom.isBefore(minimumFrom) ? windowFrom : minimumFrom;
        AdminFeePeriod accountPeriod = AdminFeePeriod.of(accountFrom, windowTo);
        // 건수만 필요해 첫 페이지 1건만 읽고 총계를 쓴다.
        long accountChangeCount = clubAuditEventRepository.searchFeeEvents(
                clubId, ACCOUNT_CHANGE_TYPES, accountPeriod.createdFrom(), accountPeriod.createdTo(),
                PageRequest.of(0, 1)).getTotalElements();
        if (accountChangeCount < ACCOUNT_CHANGES_CRITICAL) {
            return Optional.empty();
        }
        long windowDays = ChronoUnit.DAYS.between(accountFrom, windowTo);
        return Optional.of(new FeeAnomaly("FA-08", FeeAnomalySeverity.CRITICAL, "계좌 빈번 교체",
                "최근 %d일 계좌 변경·삭제 %d회 (기준 %d회)".formatted(
                        windowDays, accountChangeCount, ACCOUNT_CHANGES_CRITICAL),
                Map.of("accountChangeCount", accountChangeCount,
                        "threshold", ACCOUNT_CHANGES_CRITICAL,
                        "windowDays", windowDays)));
    }

    /**
     * 금액이 바뀐 수정인가 — 계측이 남긴 detail 에 amount 스냅샷이 있는지만 본다(값 비교는 하지 않는다).
     * 스냅샷이 깨져 있으면 그 한 건만 세지 않고 넘어간다 — 판정 하나 때문에 감사 화면을 죽이지 않는다.
     */
    private boolean hasAmountChange(ClubAuditEvent policyUpdateEvent) {
        String detail = policyUpdateEvent.getDetail();
        if (detail == null || detail.isBlank()) {
            return false;
        }
        try {
            return objectMapper.readTree(detail).has("amount");
        } catch (JsonProcessingException parseFailure) {
            log.warn("회비 정책 수정 감사 detail 파싱 실패 — FA-07 집계에서 제외: eventId={}",
                    policyUpdateEvent.getId(), parseFailure);
            return false;
        }
    }

    /** 없는(또는 삭제된) 동아리는 빈 리포트가 아니라 404 다(스펙 §7.11). */
    private void requireExistingClub(Long clubId) {
        if (!clubRepository.existsById(clubId)) {
            throw new ClubException.ClubNotFoundException();
        }
    }

    /** 비율을 소수 첫째 자리 백분율로 — 화면이 다시 계산하지 않게 evidence 에도 같은 값을 싣는다. */
    private static double percent(double ratio) {
        return Math.round(ratio * 1000.0) / 10.0;
    }
}
