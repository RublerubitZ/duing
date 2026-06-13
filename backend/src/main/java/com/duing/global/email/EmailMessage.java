package com.duing.global.email;

public record EmailMessage(
        String to,
        String subject,
        String html
) {}
