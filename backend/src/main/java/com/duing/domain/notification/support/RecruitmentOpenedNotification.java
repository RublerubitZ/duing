package com.duing.domain.notification.support;

import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.RecruitmentOpenedEvent;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.util.Map;

/**
 * RECRUITMENT_OPENED 알림 1건(찜한 유저 1명분)을 조립한다.
 *
 * <p>listener(모집 생성 직후 fan-out)·job(개시일 아침 배치) 두 발송 경로가 같은 알림을 만들기 위한
 * 단일 조립 지점이다. 제목·본문·링크·payload·dedupKey 를 모두 여기서만 만든다.
 * {@link RecruitmentDeadlineLabel}(#525) 이 body 의 마감 라벨만 먼저 분리했던 것을, 나머지까지 마저 모은 것.
 * 단, 리스너의 벌크 fan-out 은 payload 를 SQL 의 jsonb_build_object 로 만든다 — 수신자를 SELECT 로
 * 고르는 단일 원자문이라 값을 자바로 가져올 수 없다. 키·숫자 타입 정합은 통합 테스트가 고정한다.
 *
 * <p><b>dedupKey 형식은 절대 바꾸지 않는다.</b> 두 경로가 서로의 발송을 흡수(중복 발송 방지)하는 계약이
 * 이 문자열 하나뿐이라, 한 글자라도 달라지면 배치가 리스너 발송분을 못 알아보고 전량 재발송한다.
 */
public final class RecruitmentOpenedNotification {

    /**
     * 수신자와 무관한(=이벤트당 하나뿐인) 알림 문자열 — 제목·본문·링크·dedupKey.
     *
     * <p>벌크 fan-out 은 수신자를 SQL 로 고르므로 이 값들만 이벤트당 한 번 필요하다.
     * {@link #commandFor}(단건 조립)가 같은 값을 재사용해, 두 경로의 문자열이 같음을 구조로 보장한다.
     */
    public record Content(String title, String body, String linkUrl, String dedupKey) {
    }

    private RecruitmentOpenedNotification() {
    }

    public static Content contentFor(RecruitmentOpenedEvent recruitment) {
        return new Content(
                "찜한 " + recruitment.clubName() + "의 새 모집이 시작됐어요",
                recruitment.recruitmentTitle() + " · " + RecruitmentDeadlineLabel.of(recruitment.endDate()),
                // 학생측 모집 상세 라우트는 #98 PR 에서 제거되었다. active 모집은 동아리 상세 카드에
                // 임베드되어 노출되므로 동아리 상세로 보낸다. payload 의 recruitmentId 는 그대로 유지.
                "/clubs/" + recruitment.clubId(),
                "RECRUITMENT_OPENED:r=" + recruitment.recruitmentId()
        );
    }

    public static CreateNotificationCommand commandFor(Long userId, RecruitmentOpenedEvent recruitment) {
        Content content = contentFor(recruitment);
        return new CreateNotificationCommand(
                userId,
                NotificationType.RECRUITMENT_OPENED,
                content.title(),
                content.body(),
                content.linkUrl(),
                Map.of("recruitmentId", recruitment.recruitmentId(), "clubId", recruitment.clubId()),
                content.dedupKey()
        );
    }
}
