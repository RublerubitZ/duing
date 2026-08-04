package com.duing.domain.applicationEvaluation.service;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.applicationEvaluation.entity.ApplicationEvaluation;
import com.duing.domain.applicationEvaluation.repository.ApplicationEvaluationRepository;
import com.duing.domain.applicationEvaluation.service.dto.command.UpsertApplicationEvaluationCommand;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralApplicationEvaluationService implements ApplicationEvaluationService {

    private final ApplicationEvaluationRepository evaluationRepository;
    private final ApplicationRepository applicationRepository;
    private final UserRepository userRepository;
    private final ClubAuthService clubAuthService;

    @Override
    @Transactional
    public void upsert(UpsertApplicationEvaluationCommand command) {
        Application application = applicationRepository.findById(command.applicationId())
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        Long clubId = application.getRecruitment().getClub().getId();
        clubAuthService.requireManager(command.evaluatorId(), clubId);
        requireNotClosed(application);

        evaluationRepository.findByApplicationIdAndEvaluatorId(command.applicationId(), command.evaluatorId())
                .ifPresentOrElse(
                        existingEvaluation -> existingEvaluation.update(command.score(), command.memo()),
                        () -> {
                            User evaluator = userRepository.findById(command.evaluatorId())
                                    .orElseThrow(UserException.UserNotFoundException::new);
                            evaluationRepository.save(
                                    ApplicationEvaluation.create(application, evaluator, command.score(), command.memo()));
                        });
    }

    @Override
    @Transactional
    public void deleteMine(Long applicationId, Long evaluatorId) {
        Application application = applicationRepository.findById(applicationId)
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        clubAuthService.requireManager(evaluatorId, application.getRecruitment().getClub().getId());
        requireNotClosed(application);

        evaluationRepository.findByApplicationIdAndEvaluatorId(applicationId, evaluatorId)
                .ifPresent(evaluationRepository::delete);   // 없으면 그냥 통과 (idempotent)
    }

    /**
     * 마감(CLOSED)된 모집은 아카이브라 평가 저장·삭제를 모두 막는다 — 읽기 전용 화면에서 도달 가능한
     * 파괴적 쓰기까지 포함한 "조회만 허용" 원칙. 판정은 raw status 기준이므로 마감일이 지나도
     * 수동 마감 전(심사 진행 중)인 모집은 평가가 그대로 열려 있다.
     */
    private void requireNotClosed(Application application) {
        if (application.getRecruitment().getStatus() == RecruitmentStatus.CLOSED) {
            throw new RecruitmentException.ClosedRecruitmentReadOnlyException();
        }
    }
}
