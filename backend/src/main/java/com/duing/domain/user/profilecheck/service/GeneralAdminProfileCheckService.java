package com.duing.domain.user.profilecheck.service;

import com.duing.domain.user.profilecheck.entity.ProfileCheckSetting;
import com.duing.domain.user.profilecheck.entity.Semester;
import com.duing.domain.user.profilecheck.exception.ProfileCheckException;
import com.duing.domain.user.profilecheck.repository.ProfileCheckSettingRepository;
import com.duing.domain.user.profilecheck.repository.ProfileCheckStatsRepositoryCustom;
import com.duing.domain.user.profilecheck.service.dto.command.UpdateProfileCheckSettingCommand;
import com.duing.domain.user.profilecheck.service.dto.query.AdminProfileCheckQuery;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralAdminProfileCheckService implements AdminProfileCheckService {

    private final ProfileCheckSettingRepository settingRepository;
    private final ProfileCheckStatsRepositoryCustom statsRepository;
    private final Clock clock;

    @Override
    public AdminProfileCheckQuery get() {
        Semester today = Semester.current(clock);
        Optional<ProfileCheckSetting> setting = settingRepository.findById(ProfileCheckSetting.SINGLETON_ID);
        // 통계 기준은 켤 때 기록된 학기 — 학기가 지나도 오늘 학기로 갈아타지 않고 그 학기 기록을 센다(9/1 에 기준 학기가 조용히 바뀌지 않게). 모수는 지금의 회원이라 최종치로 고정되지는 않는다.
        Semester statsSemester = setting.flatMap(ProfileCheckSetting::recordedSemester).orElse(today);
        return new AdminProfileCheckQuery(
                setting.map(found -> found.isActiveIn(today)).orElse(false),
                statsSemester,
                today,
                setting.map(ProfileCheckSetting::getTitle).orElse(ProfileCheckSetting.DEFAULT_TITLE),
                setting.map(ProfileCheckSetting::getMessage).orElse(ProfileCheckSetting.DEFAULT_MESSAGE),
                statsRepository.countTargetsAndConfirmed(statsSemester));
    }

    @Override
    @Transactional
    public void update(UpdateProfileCheckSettingCommand command) {
        // 오늘 학기는 한 번만 계산해 대조와 기록에 같이 쓴다 — 시계를 두 번 읽으면 그 사이(3/1·9/1 0시)가 새 틈이 된다.
        Semester today = Semester.current(clock);
        // 선삽입보다 먼저 대조한다 — 설정 행이 없을 때의 409 도 행을 만들지 않는다. 끄기는 학기를 기록하지 않아 대조하지 않는다.
        if (command.enabled() && isRenderedInAnotherSemester(command, today)) {
            throw new ProfileCheckException.ProfileCheckSemesterChangedException();
        }
        // 행이 없을 때 FOR UPDATE 는 아무것도 잠그지 않는다 — 선삽입(ON CONFLICT DO NOTHING) 뒤 행잠금으로 첫 저장 경합을 줄 세운다.
        settingRepository.insertIfAbsent(ProfileCheckSetting.SINGLETON_ID,
                ProfileCheckSetting.DEFAULT_TITLE, ProfileCheckSetting.DEFAULT_MESSAGE, command.actorId());
        ProfileCheckSetting setting = settingRepository.findByIdForUpdate(ProfileCheckSetting.SINGLETON_ID)
                .orElseThrow(() -> new IllegalStateException("profile_check_setting 선삽입 뒤에 행이 없습니다."));
        setting.update(command.title(), command.message(), command.enabled(),
                today, command.actorId(), Instant.now(clock));
    }

    // 화면이 본 학기를 보내지 않은 요청(옛 콘솔)은 대조하지 않는다 — 옛 콘솔은 저장 직전 GET 으로 스스로 막는다.
    private static boolean isRenderedInAnotherSemester(UpdateProfileCheckSettingCommand command, Semester today) {
        if (command.currentSemesterYear() == null || command.currentSemesterTerm() == null) {
            return false;
        }
        return command.currentSemesterYear() != today.year() || command.currentSemesterTerm() != today.term();
    }
}
