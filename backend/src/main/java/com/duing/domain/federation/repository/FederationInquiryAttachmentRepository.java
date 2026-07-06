package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationInquiryAttachment;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FederationInquiryAttachmentRepository extends JpaRepository<FederationInquiryAttachment, Long> {

    // answerId IS NULL — 질문 측 첨부만 조회한다. answerId 슬롯은 답변 첨부(후속 기능) 전용이라
    // 지금은 항상 null 이지만, 그 기능이 이 테이블을 그대로 재사용할 경우 문의 상세 응답에 답변
    // 첨부가 섞여 나오는 것을 미리 막아둔다.
    List<FederationInquiryAttachment> findAllByInquiryIdAndAnswerIdIsNullOrderBySortOrderAsc(Long inquiryId);

    // 다운로드 권한 검증 후 단건 조회 — inquiryId 불일치(다른 문의의 첨부 id 주입)는 결과 없음으로
    // 걸러진다. @SQLRestriction(deleted_at IS NULL) 이 soft delete 된 첨부도 함께 제외한다.
    Optional<FederationInquiryAttachment> findByIdAndInquiryId(Long id, Long inquiryId);
}
