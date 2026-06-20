package com.duing.domain.notification.support;

import java.time.LocalDate;

/**
 * 모집 알림 body 에 들어갈 마감일 라벨을 만든다.
 * 상시모집(마감일 null)은 "상시 모집" 으로, 기간모집은 "마감 {날짜}" 로 표기한다.
 * RECRUITMENT_OPENED 알림을 만드는 listener·job 양쪽에서 동일한 문구를 쓰기 위해 한곳으로 모은다.
 */
public final class RecruitmentDeadlineLabel {

    private RecruitmentDeadlineLabel() {
    }

    public static String of(LocalDate endDate) {
        return endDate == null ? "상시 모집" : "마감 " + endDate;
    }
}
