package com.duing.domain.draft.service;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.draft.entity.ApplicationDraft;
import com.duing.domain.draft.exception.DraftException;
import com.duing.domain.draft.repository.ApplicationDraftRepository;
import com.duing.domain.draft.service.dto.command.UpsertDraftCommand;
import com.duing.domain.draft.service.dto.query.ApplicationDraftQuery;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.LocalDate;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralApplicationDraftService implements ApplicationDraftService {

    private final ApplicationDraftRepository draftRepository;
    private final RecruitmentRepository recruitmentRepository;

    @Override
    public Optional<ApplicationDraftQuery> find(Long userId, Long recruitmentId) {
        return draftRepository.findByUserIdAndRecruitmentId(userId, recruitmentId)
                .map(ApplicationDraftQuery::from);
    }

    @Override
    @Transactional
    public void upsert(UpsertDraftCommand command) {
        Recruitment recruitment = recruitmentRepository.findById(command.recruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        // 비공개 상태 동아리의 모집에는 임시저장할 수 없다 — 존재 은닉을 위해 404 (공개 상세와 동일 의미론).
        if (recruitment.getClub().getStatus() != ClubStatus.ACTIVE) {
            throw new RecruitmentException.RecruitmentNotFoundException();
        }

        if (!recruitment.isEffectivelyOpen(LocalDate.now())) {
            throw new DraftException.RecruitmentClosedException();
        }

        draftRepository.findByUserIdAndRecruitmentId(command.userId(), command.recruitmentId())
                .ifPresentOrElse(
                        existingDraft -> existingDraft.replace(command.answers()),
                        () -> draftRepository.save(
                                ApplicationDraft.create(
                                        command.userId(),
                                        command.recruitmentId(),
                                        command.answers()
                                )
                        )
                );
    }

    @Override
    @Transactional
    public void discard(Long userId, Long recruitmentId) {
        draftRepository.deleteByUserIdAndRecruitmentId(userId, recruitmentId);
    }
}
