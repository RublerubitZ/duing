package com.duing.domain.notification.listener;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.RecruitmentOpenedEvent;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.notification.support.RecruitmentOpenedNotification;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
@Slf4j
public class RecruitmentOpenedListener {

    private final NotificationRepository notificationRepository;
    private final ClubRepository clubRepository;

    // AFTER_COMMIT 은 원 트랜잭션이 이미 커밋된 뒤라 @Modifying 실행에 새 트랜잭션이 필요하다 — 그 경계는
    // 리포지토리 메서드(REQUIRES_NEW)에 있다(벌크 전환 전에는 createIfAbsent 가 같은 역할). 이 메서드에
    // @Transactional 을 붙이면 커밋이 아래 try 바깥(프록시)에서 일어나, DB 오류를 삼킨 뒤의 커밋이
    // UnexpectedRollbackException 으로 새고 AFTER_COMMIT 예외는 원 요청까지 전파돼 POST 가 500 이 된다.
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(RecruitmentOpenedEvent event) {
        // AFTER_COMMIT 시점 재검증 — 생성 커밋과 fanout 사이에 동아리가 운영 중단(비 ACTIVE)으로
        // 전환됐을 수 있다. 비 ACTIVE 동아리의 모집 오픈 알림은 보내지 않는다.
        // 배치 경로는 후보 SQL(RecruitmentRepository#findDeadlineNotificationCandidates)의
        // c.status = 'ACTIVE' 가 같은 규칙을 건다 — 두 경로 모두 ACTIVE 동아리만 발송한다.
        // (모집 자체의 삭제·마감은 이 창에서 재검사하지 않는다 — 생성 직후라 창이 매우 좁은,
        //  후보 SQL 대비 알려진 소규모 비대칭이다.)
        if (!clubRepository.existsByIdAndStatus(event.clubId(), ClubStatus.ACTIVE)) {
            log.debug("모집 오픈 알림 스킵 — 동아리가 운영 중이 아님. recruitmentId={}, clubId={}",
                    event.recruitmentId(), event.clubId());
            return;
        }

        // 실패 시멘틱: 수신자별 격리(1명 실패해도 나머지는 발송)에서 이벤트 단위 all-or-nothing 으로 바뀐다.
        // 주 실패 모드인 중복 발송은 ON CONFLICT DO NOTHING 이 행 단위로 흡수하므로(선재 수신자는 스킵,
        // 나머지는 정상 삽입) 격리가 필요한 상황이 실질적으로 남지 않는다. 그 밖의 실패는 여기서 삼켜
        // 알림 실패가 모집 등록 요청을 깨지 않는 기존 계약을 유지한다.
        try {
            RecruitmentOpenedNotification.Content content = RecruitmentOpenedNotification.contentFor(event);
            int inserted = notificationRepository.bulkInsertRecruitmentOpened(
                    NotificationType.RECRUITMENT_OPENED.name(),
                    content.title(), content.body(), content.linkUrl(),
                    event.recruitmentId(), event.clubId(), content.dedupKey());
            log.debug("RECRUITMENT_OPENED 알림 fan-out: recruitmentId={}, clubId={}, inserted={}",
                    event.recruitmentId(), event.clubId(), inserted);
        } catch (Exception failure) {
            log.warn("RECRUITMENT_OPENED 알림 실패: recruitmentId={}, clubId={}",
                    event.recruitmentId(), event.clubId(), failure);
        }
    }
}
