package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import java.time.LocalDate;

/**
 * 관리자 모집 목록·상세의 공통 행. 지원자 수는 모집 방식과 무관하게 실제 지원서를 센 값이다.
 *
 * <p>{@code clubName} 을 따로 들고 있는 이유: 목록 쿼리가 동아리를 fetch join 하지 않고 이름만
 * 스칼라로 뽑기 때문이다(집계 groupBy 와 병용 불가). 응답 매핑은 이 값을 쓰고 LAZY 연관을 건드리지 않는다.
 *
 * <p>{@code displayStatus} 를 행에 실어 두는 이유: 이 값은 "오늘"에 의존하는데, 화면이 직접 계산하면
 * 클라이언트 시계가 어긋난 순간 총동연·학생·운영진이 같은 모집을 다르게 부른다(#896). 서버가 한 번
 * 계산해 내려보내고 화면은 그대로 적는다 — 공개 응답과 같은 규칙이다.
 */
public record AdminRecruitmentRow(
        Recruitment recruitment,
        String clubName,
        long applicantCount,
        LocalDate today
) {
    /**
     * 표시 상태는 저장하지 않고 "오늘"에서 파생한다 — 값으로 들고 있으면 정규 생성자로 파생을
     * 건너뛴 행을 만들 수 있고, 그렇게 새는 순간 이 PR 이 없애려던 표기 불일치가 되돌아온다.
     */
    public RecruitmentDisplayStatus displayStatus() {
        return RecruitmentDisplayStatus.resolve(
                recruitment.getStatus(), recruitment.getStartDate(), recruitment.getEndDate(), today);
    }

    /**
     * 화면에 내보낼 지원자 수. 외부 폼 모집은 두잉에 지원 데이터가 애초에 없으므로 0 이 아니라
     * "해당 없음"(null)이다 — 화면은 이를 "—" 로 표시한다.
     */
    public Long visibleApplicantCount() {
        return recruitment.getApplicationMode() == ApplicationMode.EXTERNAL ? null : applicantCount;
    }
}
