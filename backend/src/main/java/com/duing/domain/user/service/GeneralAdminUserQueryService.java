package com.duing.domain.user.service;

import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.AdminUserActionLog;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.AdminUserActionLogRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.query.AdminUserActionQuery;
import com.duing.domain.user.service.dto.query.AdminUserDetailQuery;
import com.duing.domain.user.support.PhoneMasker;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralAdminUserQueryService implements AdminUserQueryService {

    /** 상세 패널에 나열할 조치 이력 상한. 그 이상은 이번 스코프에서 제공하지 않는다(페이지네이션 없음). */
    private static final int RECENT_ACTION_LIMIT = 20;

    private final UserRepository userRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final AdminUserActionLogRepository adminUserActionLogRepository;

    @Override
    public AdminUserDetailQuery getDetail(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(UserException.UserNotFoundException::new);

        // 개인정보 열람은 감사 대상이지 운영 조치가 아니다 — 타임라인에 섞으면 정지·해제가 묻힌다.
        List<AdminUserActionLog> recentLogs = adminUserActionLogRepository.findRecentByTargetUserId(
                userId, AdminUserAction.PHONE_VIEW, PageRequest.of(0, RECENT_ACTION_LIMIT));
        Optional<AdminUserActionLog> latestNoteLog = adminUserActionLogRepository
                .findTopByTargetUserIdAndActionOrderByIdDesc(userId, AdminUserAction.ADMIN_NOTE_UPDATED);

        // 조치 이력의 작업자 이름과 메모 최종 수정자 이름을 한 번에 해석한다(작업자 이름은 로그에 스냅샷하지 않는다).
        Map<Long, String> actorNames = resolveActorNames(recentLogs, latestNoteLog);

        return new AdminUserDetailQuery(
                user.getId(),
                user.getName(),
                user.getStudentId(),
                user.getGrade(),
                user.getCollege(),
                user.getMajor(),
                user.getRole(),
                PhoneMasker.mask(user.getPhone()),
                user.getPhoneVerifiedAt() != null,
                user.getPhoneVerifiedAt(),
                user.getStatus(),
                user.getCreatedAt(),
                user.getLastLoginAt(),
                user.getAdminNote(),
                latestNoteLog.map(AdminUserActionLog::getCreatedAt).orElse(null),
                latestNoteLog.map(noteLog -> actorNames.get(noteLog.getActorUserId())).orElse(null),
                clubMemberRepository.findClubMembershipsByUserId(userId),
                recentLogs.stream()
                        .map(actionLog -> new AdminUserActionQuery(
                                actionLog.getAction(),
                                actorNames.get(actionLog.getActorUserId()),
                                actionLog.getReason(),
                                actionLog.getCreatedAt()))
                        .toList()
        );
    }

    /**
     * 조치 이력과 메모 수정 로그에 등장하는 작업자 id 를 한 번에 이름으로 해석한다.
     * 로그마다 조회하면 이력 건수만큼 쿼리가 나가므로(N+1) id 집합을 모아 한 번만 읽는다.
     * 탈퇴한 작업자는 결과에서 빠져 이름이 null 이 된다 — 조치 사실 자체는 그대로 남긴다.
     */
    private Map<Long, String> resolveActorNames(List<AdminUserActionLog> recentLogs,
                                                Optional<AdminUserActionLog> latestNoteLog) {
        Set<Long> actorIds = Stream.concat(recentLogs.stream(), latestNoteLog.stream())
                .map(AdminUserActionLog::getActorUserId)
                .collect(Collectors.toSet());
        if (actorIds.isEmpty()) {
            return Map.of();
        }
        return userRepository.findAllById(actorIds).stream()
                .collect(Collectors.toMap(User::getId, User::getName, (first, second) -> first));
    }
}
