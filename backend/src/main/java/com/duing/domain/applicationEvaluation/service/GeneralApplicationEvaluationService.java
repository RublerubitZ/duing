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
import com.duing.domain.recruitment.service.ClosedRecruitmentPolicy;
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
     * 평가는 마감 후 허용되는 "최종 결과 확정"에 포함되지 않는 새 활동이라 저장·삭제를 모두 막는다.
     * 판정·예외는 {@link ClosedRecruitmentPolicy} 한 곳을 경유해 다른 마감 가드와 어긋나지 않게 한다.
     */
    private void requireNotClosed(Application application) {
        ClosedRecruitmentPolicy.requireOpen(application.getRecruitment());
    }
}
