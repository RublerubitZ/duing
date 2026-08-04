package com.duing.domain.recruitment.service;

import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 총동연(ADMIN) 모집 조치. 권한은 컨트롤러의 {@code @PreAuthorize} 와 URL 레이어 백스톱이 담당하므로
 * 운영진 가드({@code requireManager})는 호출하지 않는다 — admin 은 전 동아리 접근이 정당하다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralAdminRecruitmentCommandService implements AdminRecruitmentCommandService {

    private final RecruitmentRepository recruitmentRepository;
    private final ClubAuditEventRepository clubAuditEventRepository;
    private final Clock clock;

    /**
     * 운영진 수동 마감과 같은 {@code Recruitment.close} 를 탄다 — 상태 머신을 우회해 직접 UPDATE 하면
     * 종료 시각 스탬프가 빠져 가입 링크 사용 기간(스펙 v2 4.3)이 fail-closed 로 무너진다.
     * 이미 마감된 모집의 {@code RecruitmentAlreadyClosedException}(409) 은 그대로 전파해 감사도 남기지 않는다.
     */
    @Override
    @Transactional
    public void forceClose(Long recruitmentId, Long adminUserId, String reason) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        recruitment.close(LocalDateTime.now(clock));
        clubAuditEventRepository.save(ClubAuditEvent.adminForceClose(
                recruitment.getClub().getId(), recruitmentId, adminUserId, normalizeReason(reason)));
    }

    /** 공백뿐인 사유는 "미입력"과 같으므로 NULL 로 수렴시킨다(Club 의 blankToNull 은 private 이라 재사용 불가). */
    private static String normalizeReason(String reason) {
        return reason == null || reason.isBlank() ? null : reason.trim();
    }
}
