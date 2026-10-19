package com.duing.domain.user.profilecheck.service;

import com.duing.domain.user.profilecheck.entity.ProfileCheckSetting;
import com.duing.domain.user.profilecheck.entity.Semester;
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
        // 행이 없을 때 FOR UPDATE 는 아무것도 잠그지 않는다 — 선삽입(ON CONFLICT DO NOTHING) 뒤 행잠금으로 첫 저장 경합을 줄 세운다.
        settingRepository.insertIfAbsent(ProfileCheckSetting.SINGLETON_ID,
                ProfileCheckSetting.DEFAULT_TITLE, ProfileCheckSetting.DEFAULT_MESSAGE, command.actorId());
        ProfileCheckSetting setting = settingRepository.findByIdForUpdate(ProfileCheckSetting.SINGLETON_ID)
                .orElseThrow(() -> new IllegalStateException("profile_check_setting 선삽입 뒤에 행이 없습니다."));
        setting.update(command.title(), command.message(), command.enabled(),
                Semester.current(clock), command.actorId(), Instant.now(clock));
    }
}
