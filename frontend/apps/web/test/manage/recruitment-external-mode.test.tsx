import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RecruitmentDetail } from '@duing/types';
import { EXTERNAL_FORM_URL_NOT_ALLOWED_MESSAGE } from '@duing/schemas';

import { RecruitmentForm } from '../../app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';

const CONTENT_PLACEHOLDER =
  '동아리 소개, 가입 후 일정, 회비 안내 등 지원 전에 알아야 할 내용을 적어주세요';
const EXTERNAL_URL_PLACEHOLDER = 'https://docs.google.com/forms/...';

function renderCreateForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(<RecruitmentForm mode="create" submitLabel="모집 시작" onSubmit={onSubmit} isPending={false} />);
  return onSubmit;
}

/** 지원 방식 세그먼트에서 외부 폼을 고른다 — 전환은 아직 일어나지 않고 확인 다이얼로그만 열린다. */
function chooseExternalMode() {
  fireEvent.click(screen.getByRole('radio', { name: '외부 폼' }));
}

function confirmExternalMode() {
  chooseExternalMode();
  fireEvent.click(screen.getByRole('button', { name: '확인하고 전환' }));
}

function fillCreateBasics() {
  fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), {
    target: { value: '신입 부원 모집' },
  });
  fireEvent.change(screen.getByLabelText(/^시작일/), { target: { value: '2026-05-01' } });
  fireEvent.change(screen.getByLabelText(/^종료일/), { target: { value: '2026-05-31' } });
  fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '5' } });
}

/** 안내문·질문·면접·지원자 수 공개를 모두 채운 자체 폼 상태를 만든다. */
function fillInternalOnlyValues() {
  fireEvent.change(screen.getByPlaceholderText(CONTENT_PLACEHOLDER), {
    target: { value: '지원 전에 읽어주세요' },
  });
  fireEvent.click(screen.getByRole('button', { name: '+ 질문 추가' }));
  fireEvent.change(screen.getByPlaceholderText('질문 1을 입력하세요'), {
    target: { value: '지원 동기를 알려주세요' },
  });
  fireEvent.click(screen.getByRole('switch', { name: '면접 진행' }));
  fireEvent.click(screen.getByRole('switch', { name: '지원자 수 공개' }));
}

describe('RecruitmentForm — 외부 폼 전환 확인 다이얼로그', () => {
  it('외부 폼을 고르면 즉시 전환하지 않고 안내 항목과 회원 등록 절차가 담긴 다이얼로그를 띄운다', () => {
    renderCreateForm();

    chooseExternalMode();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('외부 폼 모집으로 전환할까요?');
    expect(dialog).toHaveTextContent('지원서 질문');
    expect(dialog).toHaveTextContent('안내문');
    expect(dialog).toHaveTextContent('면접');
    expect(dialog).toHaveTextContent('지원자 수 공개');
    expect(dialog).toHaveTextContent('가입 코드');
    // §7 절차 플로우
    expect(dialog).toHaveTextContent('합격자 선정');
    expect(dialog).toHaveTextContent('운영진 승인');
    // 아직 자체 폼이다 — 확인 전에는 화면이 바뀌지 않는다.
    // (모달이 열려 있는 동안 폼은 aria-hidden 뒤라 role 쿼리가 닿지 않으므로 필드 존재로 확인한다.)
    expect(screen.getByPlaceholderText(CONTENT_PLACEHOLDER)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(EXTERNAL_URL_PLACEHOLDER)).not.toBeInTheDocument();
  });

  it('취소하면 자체 폼이 유지되고 입력값도 그대로다', () => {
    renderCreateForm();
    fillInternalOnlyValues();

    chooseExternalMode();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '자체 폼' })).toBeChecked();
    expect(screen.getByPlaceholderText(CONTENT_PLACEHOLDER)).toHaveValue('지원 전에 읽어주세요');
    expect(screen.getByDisplayValue('지원 동기를 알려주세요')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '면접 진행' })).toBeChecked();
    expect(screen.getByRole('switch', { name: '지원자 수 공개' })).toBeChecked();
  });

  it('Escape 로 닫으면 취소와 같이 자체 폼이 유지된다', () => {
    renderCreateForm();

    chooseExternalMode();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '자체 폼' })).toBeChecked();
    expect(screen.getByPlaceholderText(CONTENT_PLACEHOLDER)).toBeInTheDocument();
  });

  it('확인하고 전환하면 내부 전용 값(안내문·질문·면접·지원자 수 공개)이 그 자리에서 초기화된다', () => {
    renderCreateForm();
    fillInternalOnlyValues();

    confirmExternalMode();
    // 자체 폼으로 되돌리면 초기화 결과가 드러난다 — 되돌릴 때는 다이얼로그가 뜨지 않는다.
    fireEvent.click(screen.getByRole('radio', { name: '자체 폼' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(CONTENT_PLACEHOLDER)).toHaveValue('');
    expect(screen.queryByDisplayValue('지원 동기를 알려주세요')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '면접 진행' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: '지원자 수 공개' })).not.toBeChecked();
  });

  it('초기화된 값은 제출 payload 에서도 비어 있다 — 저장 후 400 을 보지 않는다', async () => {
    const onSubmit = renderCreateForm();
    fillCreateBasics();
    fillInternalOnlyValues();

    confirmExternalMode();
    fireEvent.change(screen.getByPlaceholderText(EXTERNAL_URL_PLACEHOLDER), {
      target: { value: 'https://forms.gle/aBcD1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: '모집 시작' }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      applicationMode: 'EXTERNAL',
      externalFormUrl: 'https://forms.gle/aBcD1234',
      content: '',
      questionItems: [],
      useInterview: false,
      showApplicantCount: false,
      interviewStartDate: null,
      interviewEndDate: null,
    });
  });
});

describe('RecruitmentForm — 외부 폼 전용 화면', () => {
  it('안내문·질문·면접·지원자 수 공개 섹션을 렌더하지 않고 회원 등록 절차를 보여준다', () => {
    renderCreateForm();

    confirmExternalMode();

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      '기본 정보',
      '모집 설정',
      '회원 등록 절차',
    ]);
    expect(screen.queryByPlaceholderText(CONTENT_PLACEHOLDER)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ 질문 추가' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: '면접 진행' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: '지원자 수 공개' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(EXTERNAL_URL_PLACEHOLDER)).toBeInTheDocument();
    expect(screen.getByText(/forms\.gle/)).toBeInTheDocument();
    expect(screen.getByText('가입 코드 생성')).toBeInTheDocument();
  });

  it('자체 폼으로 되돌리면 숨겼던 섹션이 모두 돌아온다', () => {
    renderCreateForm();

    confirmExternalMode();
    fireEvent.click(screen.getByRole('radio', { name: '자체 폼' }));

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      '기본 정보',
      '모집 설정',
      '안내문',
      '지원서 질문',
    ]);
    expect(screen.getByRole('switch', { name: '면접 진행' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(EXTERNAL_URL_PLACEHOLDER)).not.toBeInTheDocument();
  });

  it('허용되지 않는 외부 폼 URL 은 제출 전에 허용 플랫폼 안내로 막는다', async () => {
    const onSubmit = renderCreateForm();
    fillCreateBasics();

    confirmExternalMode();
    fireEvent.change(screen.getByPlaceholderText(EXTERNAL_URL_PLACEHOLDER), {
      target: { value: 'https://docs.google.com.evil.com/forms' },
    });
    fireEvent.click(screen.getByRole('button', { name: '모집 시작' }));

    expect(await screen.findByText(EXTERNAL_FORM_URL_NOT_ALLOWED_MESSAGE)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

const externalCloneSeed: RecruitmentDetail = {
  id: 11,
  clubId: 3,
  clubName: '두잉 동아리',
  title: '레거시 외부 폼 모집',
  startDate: '2025-09-10',
  endDate: '2025-09-24',
  capacity: 12,
  status: 'CLOSED',
  displayStatus: 'CLOSED',
  effectivelyOpen: false,
  applicationMode: 'EXTERNAL',
  externalFormUrl: 'https://forms.gle/aBcD1234',
  useInterview: true,
  targetRole: 'MEMBER',
  content: '레거시 안내문',
  questions: ['레거시 질문'],
  questionItems: [{ id: 'q1', text: '레거시 질문', type: 'TEXT', required: true, choices: [] }],
  interviewStartDate: '2025-09-26',
  interviewEndDate: '2025-09-27',
  showApplicantCount: true,
  applicantCount: null,
};

describe('RecruitmentForm — 외부 폼 모집 복제 시드', () => {
  it('레거시 EXTERNAL 원본을 복제해도 내부 전용 값은 시드하지 않고 URL 만 이어받는다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <RecruitmentForm
        mode="create"
        submitLabel="복제하여 모집 시작"
        cloneSeed={externalCloneSeed}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    expect(screen.getByRole('radio', { name: '외부 폼' })).toBeChecked();
    expect(screen.getByPlaceholderText(EXTERNAL_URL_PLACEHOLDER)).toHaveValue(
      'https://forms.gle/aBcD1234',
    );
    expect(screen.queryByPlaceholderText(CONTENT_PLACEHOLDER)).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: '면접 진행' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^시작일/), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByLabelText(/^종료일/), { target: { value: '2026-05-31' } });
    fireEvent.click(screen.getByRole('button', { name: '복제하여 모집 시작' }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      content: '',
      questionItems: [],
      useInterview: false,
      showApplicantCount: false,
      interviewStartDate: null,
      interviewEndDate: null,
    });
  });

  it('화이트리스트를 통과하지 못하는 레거시 URL 은 시드하되 제출 시 검증으로 알린다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <RecruitmentForm
        mode="create"
        submitLabel="복제하여 모집 시작"
        cloneSeed={{ ...externalCloneSeed, externalFormUrl: 'https://example.com/legacy-form' }}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    expect(screen.getByPlaceholderText(EXTERNAL_URL_PLACEHOLDER)).toHaveValue(
      'https://example.com/legacy-form',
    );

    fireEvent.change(screen.getByLabelText(/^시작일/), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByLabelText(/^종료일/), { target: { value: '2026-05-31' } });
    fireEvent.click(screen.getByRole('button', { name: '복제하여 모집 시작' }));

    expect(await screen.findByText(EXTERNAL_FORM_URL_NOT_ALLOWED_MESSAGE)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
