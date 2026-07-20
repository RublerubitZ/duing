package com.duing.domain.draft.service;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.draft.entity.ApplicationDraft;
import com.duing.domain.draft.exception.DraftException;
import com.duing.domain.draft.repository.ApplicationDraftRepository;
import com.duing.domain.draft.service.dto.command.UpsertDraftCommand;
import com.duing.domain.draft.service.dto.query.ApplicationDraftQuery;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralApplicationDraftService implements ApplicationDraftService {

    private final ApplicationDraftRepository draftRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final Clock clock;

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

        // 마감 판정은 KST(seoulClock) 기준 — 제출 경로(GeneralApplicationService)와 동일한 시계를 쓴다.
        if (!recruitment.isEffectivelyOpen(LocalDate.now(clock))) {
            throw new DraftException.RecruitmentClosedException();
        }

        List<ApplicationDraft.DraftAnswer> resolvedAnswers = resolveDraftAnswers(recruitment, command.answers());

        draftRepository.findByUserIdAndRecruitmentId(command.userId(), command.recruitmentId())
                .ifPresentOrElse(
                        existingDraft -> existingDraft.replace(resolvedAnswers),
                        () -> draftRepository.save(
                                ApplicationDraft.create(
                                        command.userId(),
                                        command.recruitmentId(),
                                        resolvedAnswers
                                )
                        )
                );
    }

    @Override
    @Transactional
    public void discard(Long userId, Long recruitmentId) {
        draftRepository.deleteByUserIdAndRecruitmentId(userId, recruitmentId);
    }

    /**
     * questionId 가 폼 질문 UUID 면 그대로, 숫자(legacy 인덱스)면 해당 위치 질문의 UUID 로 치환한다.
     * 어느 쪽도 아니면 엔트리를 버린다 — 임시저장은 제출이 아니므로 관대하게 처리 (스펙 §2.1·§2.5).
     * TODO(legacy-questions-v1): 숫자 인덱스 해석 제거.
     */
    private List<ApplicationDraft.DraftAnswer> resolveDraftAnswers(
            Recruitment recruitment, List<UpsertDraftCommand.DraftAnswerEntry> entries) {
        List<RecruitmentQuestion> questions = recruitment.getForm() == null
                ? List.of() : recruitment.getForm().getQuestions();
        Set<String> questionIds = questions.stream().map(RecruitmentQuestion::id).collect(Collectors.toSet());

        return entries.stream()
                .map(entry -> {
                    String resolvedQuestionId = resolveQuestionId(entry.questionId(), questions, questionIds);
                    if (resolvedQuestionId == null) {
                        return null;
                    }
                    List<String> values = entry.values() != null
                            ? entry.values()
                            : entry.value() != null ? List.of(entry.value()) : List.of();
                    return new ApplicationDraft.DraftAnswer(resolvedQuestionId, values);
                })
                .filter(Objects::nonNull)
                .toList();
    }

    private String resolveQuestionId(String rawQuestionId, List<RecruitmentQuestion> questions,
                                     Set<String> questionIds) {
        if (rawQuestionId == null) {
            return null;
        }
        if (questionIds.contains(rawQuestionId)) {
            return rawQuestionId;
        }
        try {
            int legacyIndex = Integer.parseInt(rawQuestionId);
            return legacyIndex >= 0 && legacyIndex < questions.size() ? questions.get(legacyIndex).id() : null;
        } catch (NumberFormatException notAnIndex) {
            return null;
        }
    }
}
