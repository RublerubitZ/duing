package com.duing.domain.user.profilecheck.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.FixedClockConfig;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.profilecheck.entity.ProfileCheckSetting;
import com.duing.domain.user.profilecheck.repository.ProfileCheckSettingRepository;
import com.duing.domain.user.profilecheck.service.dto.command.UpdateProfileCheckSettingCommand;
import com.duing.domain.user.repository.UserRepository;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import({TestcontainersConfiguration.class, FixedClockConfig.class})
@SpringBootTest
class GeneralAdminProfileCheckServiceConcurrencyTest extends IntegrationTestBase {

    @Autowired
    private AdminProfileCheckService adminProfileCheckService;

    @Autowired
    private ProfileCheckSettingRepository settingRepository;

    @Autowired
    private UserRepository userRepository;

    private ExecutorService executor;

    @AfterEach
    void tearDown() {
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    @Test
    @DisplayName("운영진 두 명이 처음 저장을 동시에 해도 둘 다 성공하고 설정 행은 하나만 생긴다")
    void firstSavesRacingDoNotFail() throws Exception {
        User firstAdmin = userRepository.save(UserFixture.admin());
        User secondAdmin = userRepository.save(UserFixture.admin());
        CountDownLatch start = new CountDownLatch(1);
        executor = Executors.newFixedThreadPool(2);

        List<Future<Void>> saves = List.of(
                executor.submit(() -> {
                    start.await();
                    adminProfileCheckService.update(
                            new UpdateProfileCheckSettingCommand(firstAdmin.getId(), "첫 제목", "첫 문구", true));
                    return null;
                }),
                executor.submit(() -> {
                    start.await();
                    adminProfileCheckService.update(
                            new UpdateProfileCheckSettingCommand(secondAdmin.getId(), "둘째 제목", "둘째 문구", false));
                    return null;
                }));
        start.countDown();

        for (Future<Void> save : saves) {
            // 한쪽이라도 예외(PK 위반 등)면 ExecutionException 으로 테스트가 실패한다.
            save.get(10, TimeUnit.SECONDS);
        }
        assertThat(settingRepository.count()).isEqualTo(1);
        ProfileCheckSetting setting = settingRepository.findById(ProfileCheckSetting.SINGLETON_ID).orElseThrow();
        assertThat(setting.getTitle()).isIn("첫 제목", "둘째 제목");
    }
}
