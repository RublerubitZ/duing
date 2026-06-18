package com.duing.domain.fee.service;

import com.duing.domain.fee.controller.dto.response.ReceiptResponse;

public interface ReceiptService {
    // 회원 본인 영수증(본인 청구 아니면 404).
    ReceiptResponse getMemberReceipt(Long userId, Long billId);

    // 총무 영수증(requireManager + 동아리 격리, 아니면 403/404).
    ReceiptResponse getClubReceipt(Long clubId, Long actorId, Long billId);
}
