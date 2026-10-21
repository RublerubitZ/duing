package com.duing.domain.user.profilecheck.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;

import com.duing.common.FixedClockConfig;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.profilecheck.entity.Semester;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/**
 * 기록기를 실패시키는 스파이가 컨텍스트를 바꾸므로 다른 테스트와 분리한다. @MockitoSpyBean 의 스텁은
 * 테스트마다 자동으로 초기화된다(GeneralApplicationServiceTest 주석 참조).
 */
@Import({TestcontainersConfiguration.class, FixedClockConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ProfileCheckRecordRollbackTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @MockitoSpyBean
    private ProfileCheckConfirmationRecorder confirmationRecorder;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("확인 기록을 남기다 실패하면 같은 트랜잭션의 프로필 변경도 되돌아간다")
    void failedRecordRollsBackProfileChange() {
        User student = UserFixture.unique();
        student.changeGrade(Grade.SOPHOMORE, UserFixture.PAST_GRADE_CHANGE);
        student = userRepository.save(student);
        String nameBefore = student.getName();
        doThrow(new IllegalStateException("기록 실패")).when(confirmationRecorder).record(anyLong(), any(Semester.class));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION,
                        "Bearer " + jwtTokenProvider.createToken(student.getId(), student.getRole().name()))
                .contentType(ContentType.JSON)
                .body("{\"name\":\"수정이름\",\"grade\":\"JUNIOR\"}")
                .when().patch("/api/v1/users/me")
                .then()
                .statusCode(HttpStatus.INTERNAL_SERVER_ERROR.value());

        User unchanged = userRepository.findById(student.getId()).orElseThrow();
        assertThat(unchanged.getGrade()).isEqualTo(Grade.SOPHOMORE);
        assertThat(unchanged.getName()).isEqualTo(nameBefore);
    }
}
