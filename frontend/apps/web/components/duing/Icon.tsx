import type { SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & {
  size?: number;
};

export function ArrowLeft({ size = 16, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="11 6 5 12 11 18" />
    </svg>
  );
}

export function Search({ size = 18, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="20" y1="20" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function ArrowRight({ size = 16, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </svg>
  );
}

export function Check({ size = 18, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <polyline points="5 12 10 17 19 7" />
    </svg>
  );
}

export function Lock({ size = 14, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function X({ size = 18, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export function Share({ size = 18, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
    </svg>
  );
}

export function Home({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10V20h13V10" />
      <path d="M10 20v-4.5h4V20" />
    </svg>
  );
}

export function Compass({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2.2 5.3-5.3 2.2 2.2-5.3z" />
    </svg>
  );
}

export function Calendar({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <rect x="4" y="5.5" width="16" height="15" rx="2" />
      <line x1="4" y1="10" x2="20" y2="10" />
      <line x1="8.5" y1="3.5" x2="8.5" y2="7" />
      <line x1="15.5" y1="3.5" x2="15.5" y2="7" />
    </svg>
  );
}

export function Megaphone({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

export function Info({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

/** 마감 임박 티커 라벨용 사이렌 — Figma 컴포넌트 `Siren`(308:7156) 에서 내보낸 면(fill) 글리프 그대로. */
export function Siren({ size = 32, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" aria-hidden {...rest}>
      <path d="M15 2V1C15 0.734784 15.1054 0.48043 15.2929 0.292893C15.4804 0.105357 15.7348 0 16 0C16.2652 0 16.5196 0.105357 16.7071 0.292893C16.8946 0.48043 17 0.734784 17 1V2C17 2.26522 16.8946 2.51957 16.7071 2.70711C16.5196 2.89464 16.2652 3 16 3C15.7348 3 15.4804 2.89464 15.2929 2.70711C15.1054 2.51957 15 2.26522 15 2ZM25 6C25.1314 6.0001 25.2615 5.97432 25.3829 5.92414C25.5042 5.87395 25.6146 5.80033 25.7075 5.7075L26.7075 4.7075C26.8951 4.51986 27.0006 4.26536 27.0006 4C27.0006 3.73464 26.8951 3.48014 26.7075 3.2925C26.5199 3.10486 26.2654 2.99944 26 2.99944C25.7346 2.99944 25.4801 3.10486 25.2925 3.2925L24.2925 4.2925C24.1525 4.43236 24.0571 4.61061 24.0185 4.80469C23.9798 4.99878 23.9996 5.19997 24.0754 5.38279C24.1511 5.56561 24.2794 5.72185 24.444 5.83172C24.6086 5.94159 24.8021 6.00016 25 6ZM6.2925 5.7075C6.38541 5.80041 6.49571 5.87411 6.6171 5.92439C6.7385 5.97468 6.86861 6.00056 7 6.00056C7.13139 6.00056 7.2615 5.97468 7.3829 5.92439C7.50429 5.87411 7.61459 5.80041 7.7075 5.7075C7.80041 5.61459 7.87411 5.50429 7.92439 5.3829C7.97468 5.2615 8.00056 5.13139 8.00056 5C8.00056 4.86861 7.97468 4.7385 7.92439 4.6171C7.87411 4.49571 7.80041 4.38541 7.7075 4.2925L6.7075 3.2925C6.51986 3.10486 6.26536 2.99944 6 2.99944C5.73464 2.99944 5.48014 3.10486 5.2925 3.2925C5.10486 3.48014 4.99944 3.73464 4.99944 4C4.99944 4.26536 5.10486 4.51986 5.2925 4.7075L6.2925 5.7075ZM29 22V25C29 25.5304 28.7893 26.0391 28.4142 26.4142C28.0391 26.7893 27.5304 27 27 27H5C4.46957 27 3.96086 26.7893 3.58579 26.4142C3.21071 26.0391 3 25.5304 3 25V22C3 21.4696 3.21071 20.9609 3.58579 20.5858C3.96086 20.2107 4.46957 20 5 20V16C4.99996 14.5484 5.28723 13.1111 5.84526 11.771C6.4033 10.431 7.22105 9.21461 8.25138 8.19207C9.28171 7.16952 10.5042 6.36102 11.8485 5.81316C13.1928 5.26531 14.6322 4.98895 16.0837 5C22.1025 5.045 27 10.0363 27 16.125V20C27.5304 20 28.0391 20.2107 28.4142 20.5858C28.7893 20.9609 29 21.4696 29 22ZM16.835 10.9862C19.2087 11.385 21 13.54 21 16C21 16.2652 21.1054 16.5196 21.2929 16.7071C21.4804 16.8946 21.7348 17 22 17C22.2652 17 22.5196 16.8946 22.7071 16.7071C22.8946 16.5196 23 16.2652 23 16C23 12.575 20.4913 9.57125 17.165 9.01375C17.0349 8.99075 16.9016 8.99374 16.7726 9.02257C16.6437 9.05139 16.5218 9.10548 16.4139 9.1817C16.306 9.25791 16.2143 9.35475 16.144 9.46662C16.0738 9.57849 16.0264 9.70317 16.0046 9.83346C15.9828 9.96375 15.987 10.0971 16.017 10.2257C16.047 10.3544 16.1023 10.4758 16.1795 10.583C16.2567 10.6902 16.3544 10.781 16.4669 10.8502C16.5794 10.9194 16.7045 10.9657 16.835 10.9862ZM27 25V22H5V25H27Z" />
    </svg>
  );
}
