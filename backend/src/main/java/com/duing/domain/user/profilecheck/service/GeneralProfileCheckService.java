package com.duing.domain.user.profilecheck.service;

import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.profilecheck.entity.ProfileCheckSetting;
import com.duing.domain.user.profilecheck.entity.Semester;
import com.duing.domain.user.profilecheck.exception.ProfileCheckException;
import com.duing.domain.user.profilecheck.repository.ProfileCheckConfirmationRepository;
import com.duing.domain.user.profilecheck.repository.ProfileCheckSettingRepository;
import com.duing.domain.user.profilecheck.service.dto.command.ConfirmProfileCheckCommand;
import com.duing.domain.user.profilecheck.service.dto.query.ProfileCheckStatusQuery;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralProfileCheckService implements ProfileCheckService {

    private final UserRepository userRepository;
    private final ProfileCheckSettingRepository settingRepository;
    private final ProfileCheckConfirmationRepository confirmationRepository;
    private final ProfileCheckConfirmationRecorder confirmationRecorder;
    private final Clock clock;

    @Override
    public ProfileCheckStatusQuery getStatus(Long userId) {
        Semester today = Semester.current(clock);
        Optional<ProfileCheckSetting> activeSetting = settingRepository.findById(ProfileCheckSetting.SINGLETON_ID)
                .filter(setting -> setting.isActiveIn(today));
        if (activeSetting.isEmpty()) {
            return ProfileCheckStatusQuery.none();
        }
        User user = userRepository.findById(userId).orElseThrow(UserException.UserNotFoundException::new);
        if (!ProfileCheckPolicy.isTarget(user) || isConfirmed(userId, today)) {
            return ProfileCheckStatusQuery.none();
        }
        ProfileCheckSetting setting = activeSetting.get();
        return new ProfileCheckStatusQuery(
                true,
                today,
                setting.getTitle(),
                setting.getMessage(),
                user.getGrade(),
                user.getCollege(),
                user.getMajor(),
                ProfileCheckPolicy.suggestedGrade(user.getGrade(), user.getCreatedAt(), today));
    }

    @Override
    @Transactional
    public void confirm(ConfirmProfileCheckCommand command) {
        Semester today = Semester.current(clock);
        // 잠금 조회가 이 트랜잭션의 첫 사용자 조회다 — 무잠금 선조회가 1차 캐시에 옛 값을 남기지 않게.
        User user = userRepository.findByIdForUpdate(command.userId())
                .orElseThrow(UserException.UserNotFoundException::new);
        // 이미 확인한 학기면 아무 것도 바꾸지 않는다 — 더블클릭·재시도·다른 기기에서도 학년이 두 번 오르지 않는다.
        if (isConfirmed(user.getId(), command.semester())) {
            return;
        }
        // 설정은 잠그지 않고 읽는다 — READ COMMITTED 로 이 순간의 최신 설정이고, 운영진이 끈 뒤의 요청은 409 다.
        boolean active = settingRepository.findById(ProfileCheckSetting.SINGLETON_ID)
                .map(setting -> setting.isActiveIn(today))
                .orElse(false);
        if (!active || !command.semester().equals(today) || !ProfileCheckPolicy.isTarget(user)) {
            throw new ProfileCheckException.ProfileCheckClosedException();
        }
        if (command.grade() != null) {
            Grade suggestedGrade = ProfileCheckPolicy.suggestedGrade(user.getGrade(), user.getCreatedAt(), today);
            if (command.grade() != suggestedGrade) {
                throw new ProfileCheckException.InvalidProfileCheckGradeException();
            }
            user.changeGrade(command.grade());
        }
        confirmationRecorder.record(user.getId(), today);
    }

    private boolean isConfirmed(Long userId, Semester semester) {
        return confirmationRepository.existsByUserIdAndSemesterYearAndSemesterTerm(
                userId, semester.year(), semester.term());
    }
}
