package com.duing.domain.report.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportReasonCode;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.domain.report.exception.ReportException;
import com.duing.domain.report.service.dto.command.CreateReportCommand;
import com.duing.domain.report.service.dto.command.ProcessReportCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class GeneralReportServiceTest {

    @Autowired ReportService reportService;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "사용자" + seq, "user" + seq + "@duing.ac.kr",
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    private Club saveClub(String name) {
        return clubRepository.save(Club.create(name, ClubCategory.ACADEMIC,
                null, "설명", null));
    }

    @Test
    @DisplayName("정상 신고를 생성하면 PENDING 상태로 저장된다")
    void createPendingReport() {
        User reporter = saveUser(UserRole.STUDENT);
        Club club = saveClub("타깃동아리1");

        Long reportId = reportService.create(new CreateReportCommand(
                reporter.getId(), ReportTargetType.CLUB, club.getId(),
                ReportReasonCode.INAPPROPRIATE, "부적절"));

        Report saved = reportService.getById(reportId);
        assertThat(saved.getStatus()).isEqualTo(ReportStatus.PENDING);
        assertThat(saved.getReporterId()).isEqualTo(reporter.getId());
    }

    @Test
    @DisplayName("동일 신고자가 동일 대상에 PENDING 신고가 있으면 중복 예외가 발생한다")
    void duplicatePendingReportFails() {
        User reporter = saveUser(UserRole.STUDENT);
        Club club = saveClub("타깃동아리2");
        CreateReportCommand command = new CreateReportCommand(
                reporter.getId(), ReportTargetType.CLUB, club.getId(),
                ReportReasonCode.SPAM, null);
        reportService.create(command);

        assertThatThrownBy(() -> reportService.create(command))
                .isInstanceOf(ReportException.DuplicatePendingReportException.class);
    }

    @Test
    @DisplayName("종결된 신고가 있더라도 동일 대상 재신고는 허용된다")
    void reportAgainAfterTerminalAllowed() {
        User reporter = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub("타깃동아리3");
        Long firstId = reportService.create(new CreateReportCommand(
                reporter.getId(), ReportTargetType.CLUB, club.getId(),
                ReportReasonCode.SPAM, null));
        reportService.process(new ProcessReportCommand(
                firstId, admin.getId(), ReportStatus.DISMISSED, "무효"));

        Long secondId = reportService.create(new CreateReportCommand(
                reporter.getId(), ReportTargetType.CLUB, club.getId(),
                ReportReasonCode.SPAM, null));
        assertThat(secondId).isNotEqualTo(firstId);
    }

    @Test
    @DisplayName("대상 Club 이 존재하지 않으면 ReportTargetNotFoundException")
    void targetClubNotFound() {
        User reporter = saveUser(UserRole.STUDENT);
        assertThatThrownBy(() -> reportService.create(new CreateReportCommand(
                reporter.getId(), ReportTargetType.CLUB, 999_999L,
                ReportReasonCode.SPAM, null)))
                .isInstanceOf(ReportException.ReportTargetNotFoundException.class);
    }

    @Test
    @DisplayName("자신이 운영하는 동아리는 신고할 수 없다 (셀프신고 차단)")
    void selfReportRejected() {
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveClub("내동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> reportService.create(new CreateReportCommand(
                leader.getId(), ReportTargetType.CLUB, club.getId(),
                ReportReasonCode.SPAM, null)))
                .isInstanceOf(ReportException.SelfReportNotAllowedException.class);
    }

    @Test
    @DisplayName("ADMIN 이 신고를 RESOLVED 로 처리하면 처리자/처리시각이 저장된다")
    void processResolved() {
        User reporter = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub("타깃동아리5");
        Long reportId = reportService.create(new CreateReportCommand(
                reporter.getId(), ReportTargetType.CLUB, club.getId(),
                ReportReasonCode.SPAM, null));

        reportService.process(new ProcessReportCommand(
                reportId, admin.getId(), ReportStatus.RESOLVED, "조치 완료"));

        Report processed = reportService.getById(reportId);
        assertThat(processed.getStatus()).isEqualTo(ReportStatus.RESOLVED);
        assertThat(processed.getHandledBy()).isEqualTo(admin.getId());
        assertThat(processed.getHandledAt()).isNotNull();
        assertThat(processed.getActionNote()).isEqualTo("조치 완료");
    }

    @Test
    @DisplayName("이미 종결된 신고를 다시 처리하면 예외가 발생한다")
    void processAlreadyTerminalFails() {
        User reporter = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub("타깃동아리6");
        Long reportId = reportService.create(new CreateReportCommand(
                reporter.getId(), ReportTargetType.CLUB, club.getId(),
                ReportReasonCode.SPAM, null));
        reportService.process(new ProcessReportCommand(
                reportId, admin.getId(), ReportStatus.RESOLVED, null));

        assertThatThrownBy(() -> reportService.process(new ProcessReportCommand(
                reportId, admin.getId(), ReportStatus.DISMISSED, null)))
                .isInstanceOf(ReportException.InvalidReportTransitionException.class);
    }
}
