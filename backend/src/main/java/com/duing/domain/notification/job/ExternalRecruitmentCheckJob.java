package com.duing.domain.notification.job;

import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import com.duing.domain.notification.support.OperatorNotificationSupport;
import com.duing.domain.recruitment.repository.ExternalStillOpenRow;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 매일 오전 9시 30분(Asia/Seoul)에 실행되는 외부 폼 상시모집 유지 확인 잡.
 * 외부 폼 모집은 지원서가 두잉에 없어 접수·미처리 알림이 닿지 않고, 상시모집은 운영진이 닫지 않으면 계속 "모집 중"이다.
 * 시작 후 {@link #CHECK_INTERVAL_DAYS}일 주기마다 운영진(회장·임원)에게 EXTERNAL_RECRUITMENT_STILL_OPEN 을
 * 모집 × 운영진 × 주기 1건 보내 아직 받고 있는지 확인하게 한다.
 * {@code duing.notification.jobs.enabled=true} 가 설정된 환경에서만 동작한다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "duing.notification.jobs", name = "enabled", havingValue = "true")
public class ExternalRecruitmentCheckJob {

    /**
     * 유지 확인 주기(시작 후 경과일). 주기 번호 = 경과일 / 이 값.
     * 알림 보존일({@link com.duing.domain.notification.NotificationRetention#RETENTION_DAYS}, 30일) ≥ 이 주기여야 한다 — 보존 기간이 지나 주기 키가 지워진 뒤에는
     * 주기 번호가 이미 다음 값이라 재발송되지 않는데, 보존일이 주기보다 짧으면 같은 주기 안에서 키가 지워져 다시 보낸다.
     * 잡이 오래 멈췄다가 주기 경계 직전에 복구되면(예: 59일째) 그 주기와 다음 주기가 이틀 연달아 나갈 수 있다 — 놓친 주기를
     * 한 번은 보내는 설계의 귀결이라 의도된 동작이다.
     */
    static final int CHECK_INTERVAL_DAYS = 30;

    private final RecruitmentRepository recruitmentRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final NotificationService notificationService;
    private final Clock clock;

    // 미처리 지원서 리마인더와 같은 시각 — 스케줄러 풀이 여러 스레드라 겹쳐도 서로 기다리지 않는다.
    @Scheduled(cron = "0 30 9 * * *", zone = "Asia/Seoul")
    @Transactional(readOnly = true)
    public void run() {
        // start_date 는 KST 날짜라 경과일·주기 번호도 KST 오늘로 센다(TIMEZONE.md).
        LocalDate today = LocalDate.now(clock);
        List<ExternalStillOpenRow> candidates =
                recruitmentRepository.findExternalStillOpenCandidates(today, CHECK_INTERVAL_DAYS);
        log.info("ExternalRecruitmentCheckJob start: candidates={}", candidates.size());

        int created = 0;
        for (ExternalStillOpenRow row : candidates) {
            List<Long> officerUserIds = clubMemberRepository.findOfficerUserIdsByClubIdIn(List.of(row.getClubId()));
            for (Long officerUserId : officerUserIds) {
                try {
                    if (notificationService.createIfAbsent(buildCheckCommand(officerUserId, row))) {
                        created++;
                    }
                } catch (Exception failure) {
                    log.warn("EXTERNAL_RECRUITMENT_STILL_OPEN 알림 실패: userId={}, recruitmentId={}",
                            officerUserId, row.getRecruitmentId(), failure);
                }
            }
        }
        log.info("ExternalRecruitmentCheckJob done: created={}", created);
    }

    private CreateNotificationCommand buildCheckCommand(Long officerUserId, ExternalStillOpenRow row) {
        // 날짜가 아닌 주기 번호로 중복을 막는다 — 잡이 하루 이틀 못 돌아도 다음 실행이 그 주기를 한 번 보낸다
        // ("경과일 % 주기 == 0" 인 날에만 보내면 그날을 놓쳤을 때 한 주기를 통째로 건너뛴다).
        int period = row.getDaysOpen() / CHECK_INTERVAL_DAYS;
        return new CreateNotificationCommand(
                officerUserId,
                NotificationType.EXTERNAL_RECRUITMENT_STILL_OPEN,
                "외부 폼 모집이 " + row.getDaysOpen() + "일째 열려 있어요",
                OperatorNotificationSupport.truncateBody(
                        row.getTitle() + " · 아직 받고 있다면 그대로 두고, 마감했다면 '접수 마감'을 눌러 주세요"),
                OperatorNotificationSupport.manageRecruitmentLink(row.getClubId(), row.getRecruitmentId()),
                Map.of("recruitmentId", row.getRecruitmentId(), "clubId", row.getClubId(),
                        "daysOpen", row.getDaysOpen()),
                "EXTERNAL_RECRUITMENT_STILL_OPEN:r=" + row.getRecruitmentId() + ":p=" + period
        );
    }
}
