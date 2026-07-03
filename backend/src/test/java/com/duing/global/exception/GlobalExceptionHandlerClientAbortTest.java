package com.duing.global.exception;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import org.apache.catalina.connector.ClientAbortException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

/**
 * 클라이언트 단절(브라우저 타임아웃·요청 취소) 시 응답 재작성·500 변환 없이 조용히 종료되는지 검증.
 * 이 예외들이 catch-all 로 흘러가면 ERROR 로그 + Sentry 가짜 오류가 발생한다.
 */
class GlobalExceptionHandlerClientAbortTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new ClientDisconnectStubController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    @DisplayName("응답 쓰기 중 클라이언트가 끊겨 AsyncRequestNotUsableException 이 나면 죽은 소켓에 바디를 다시 쓰지 않고 조용히 끝난다")
    void asyncRequestNotUsableIsHandledQuietlyWithoutBody() throws Exception {
        mockMvc.perform(get("/client-abort/async-not-usable"))
                .andExpect(content().string(""));
    }

    @Test
    @DisplayName("Tomcat ClientAbortException(Broken pipe)도 500 변환 없이 바디를 쓰지 않고 조용히 끝난다")
    void clientAbortIsHandledQuietlyWithoutBody() throws Exception {
        mockMvc.perform(get("/client-abort/broken-pipe"))
                .andExpect(content().string(""));
    }

    @Test
    @DisplayName("클라이언트 단절이 아닌 일반 예외는 여전히 catch-all 이 500 과 오류 바디로 응답한다")
    void otherExceptionsStillGoToCatchAll() throws Exception {
        mockMvc.perform(get("/client-abort/real-error"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.message").value("서버 오류가 발생했습니다."));
    }

    @RestController
    static class ClientDisconnectStubController {

        @GetMapping("/client-abort/async-not-usable")
        String asyncNotUsable() throws IOException {
            throw new AsyncRequestNotUsableException("ServletOutputStream failed to flush",
                    new IOException("Broken pipe"));
        }

        @GetMapping("/client-abort/broken-pipe")
        String brokenPipe() throws IOException {
            throw new ClientAbortException(new IOException("Broken pipe"));
        }

        @GetMapping("/client-abort/real-error")
        String realError() {
            throw new IllegalStateException("실제 서버 결함");
        }
    }
}
