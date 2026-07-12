package com.duing.global.exception;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/**
 * 멀티파트 업로드가 서블릿 한도를 초과하면 catch-all(500) 이 아니라 413 으로 응답하는지 검증.
 * 500 으로 흘러가면 클라이언트 입력 오류가 Sentry ERROR 로 잘못 승격된다.
 */
class GlobalExceptionHandlerUploadSizeTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new UploadStubController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    @DisplayName("업로드 크기 초과(MaxUploadSizeExceededException)는 500 이 아니라 413 과 한국어 안내로 응답한다")
    void maxUploadSizeExceededMapsTo413() throws Exception {
        mockMvc.perform(post("/upload-stub/too-large"))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.message").value("업로드 가능한 최대 크기를 초과했습니다."));
    }

    @RestController
    static class UploadStubController {

        @PostMapping("/upload-stub/too-large")
        String tooLarge() {
            throw new MaxUploadSizeExceededException(10L * 1024 * 1024);
        }
    }
}
