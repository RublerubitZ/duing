import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RecruitmentDetail } from '@duing/types';
import { RecruitmentForm } from '../../app/manage/clubs/[clubId]/recruitments/_components/RecruitmentForm';
import { toBuilderQuestions } from '../../app/manage/clubs/[clubId]/recruitments/_components/QuestionBuilder';

describe('toBuilderQuestions — undefined(구 BE) 와 [](신 BE 외부 폼) 구분', () => {
  it('빈 배열이면 legacy questions 텍스트로 fallback 하지 않는다', () => {
    expect(toBuilderQuestions([], ['서버가 이미 없다고 답한 질문'], () => 'key-1')).toEqual([]);
  });

  it('undefined 면 legacy questions 텍스트를 주관식으로 시드한다', () => {
    expect(toBuilderQuestions(undefined, ['지원 동기는?'], () => 'key-1')).toEqual([
      { key: 'key-1', id: null, text: '지원 동기는?', type: 'TEXT', required: true, choices: [] },
    ]);
  });
});

describe('RecruitmentForm — 상시모집 토글', () => {
  it('상시모집 체크박스를 켜면 종료일 입력이 disabled 되고 값이 비워진다', () => {
    render(<RecruitmentForm mode="create" onSubmit={vi.fn()} isPending={false} />);
    const endDateInput = screen.getByLabelText(/^종료일/) as HTMLInputElement;
    const alwaysOpenCheckbox = screen.getByLabelText(/^상시모집/);

    fireEvent.change(endDateInput, { target: { value: '2026-12-31' } });
    expect(endDateInput.value).toBe('2026-12-31');

    fireEvent.click(alwaysOpenCheckbox);
    expect(endDateInput).toBeDisabled();
    expect(endDateInput.value).toBe('');
  });

  it('상시모집 체크 + 외부폼 으로 채워 제출하면 endDate=null 로 onSubmit 이 호출된다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RecruitmentForm mode="create" onSubmit={onSubmit} isPending={false} />);

    fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), {
      target: { value: '상시모집 공고' },
    });
    fireEvent.change(screen.getByLabelText(/시작일/), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '5' } });

    fireEvent.click(screen.getByLabelText(/^상시모집/));

    // 외부 폼은 지원 질문을 요구하지 않으므로 상시모집 단독 검증에 적합하다.
    fireEvent.click(screen.getByLabelText('외부 폼'));
    fireEvent.change(screen.getByPlaceholderText('https://forms.google.com/...'), {
      target: { value: 'https://forms.example.com/x' },
    });

    fireEvent.click(screen.getByRole('button', { name: /모집 작성/ }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ endDate: null });
  });
});

const baseRecruitmentDetail: RecruitmentDetail = {
  id: 7,
  clubId: 3,
  clubName: '두잉 동아리',
  title: '기존 모집',
  startDate: '2026-05-01',
  endDate: '2026-05-31',
  capacity: 5,
  status: 'OPEN',
  displayStatus: 'OPEN',
  effectivelyOpen: true,
  applicationMode: 'SELF',
  externalFormUrl: null,
  useInterview: false,
  targetRole: 'MEMBER',
  content: null,
  questions: [],
  interviewStartDate: null,
  interviewEndDate: null,
  showApplicantCount: false,
  applicantCount: null,
};

/** 자체 폼 create 모드에서 질문 외 필수 입력을 모두 채운다. */
function fillCreateBasics() {
  fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), {
    target: { value: '신입 부원 모집' },
  });
  fireEvent.change(screen.getByLabelText(/^시작일/), { target: { value: '2026-05-01' } });
  fireEvent.change(screen.getByLabelText(/^종료일/), { target: { value: '2026-05-31' } });
  fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '5' } });
}

function addQuestion(text: string) {
  fireEvent.click(screen.getByRole('button', { name: '+ 질문 추가' }));
  fireEvent.change(screen.getByPlaceholderText('질문 1을 입력하세요'), { target: { value: text } });
}

describe('RecruitmentForm — 질문 유형 빌더', () => {
  it('질문 유형을 객관식(단일 선택)으로 바꾸면 선택지 입력이 나타난다', () => {
    render(<RecruitmentForm mode="create" onSubmit={vi.fn()} isPending={false} />);

    fireEvent.click(screen.getByRole('button', { name: '+ 질문 추가' }));
    expect(screen.getByLabelText('주관식')).toBeChecked();
    expect(screen.queryByPlaceholderText('선택지 1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('객관식(단일 선택)'));

    expect(screen.getByPlaceholderText('선택지 1')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('선택지 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ 선택지 추가' })).toBeInTheDocument();
  });

  it('객관식 질문은 선택지와 함께 제출된다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RecruitmentForm mode="create" onSubmit={onSubmit} isPending={false} />);

    fillCreateBasics();
    addQuestion('학년을 선택해주세요');
    fireEvent.click(screen.getByLabelText('객관식(단일 선택)'));
    fireEvent.change(screen.getByPlaceholderText('선택지 1'), { target: { value: '1학년' } });
    fireEvent.change(screen.getByPlaceholderText('선택지 2'), { target: { value: '2학년' } });

    fireEvent.click(screen.getByRole('button', { name: /모집 작성/ }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]?.questionItems).toEqual([
      {
        id: null,
        text: '학년을 선택해주세요',
        type: 'SINGLE_CHOICE',
        required: true,
        choices: [
          { id: null, label: '1학년' },
          { id: null, label: '2학년' },
        ],
      },
    ]);
  });

  it('필수 질문 체크박스는 기본 선택이고 해제하면 required=false 로 제출된다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RecruitmentForm mode="create" onSubmit={onSubmit} isPending={false} />);

    fillCreateBasics();
    addQuestion('지원 동기를 알려주세요');

    const requiredCheckbox = screen.getByLabelText('필수 질문');
    expect(requiredCheckbox).toBeChecked();
    fireEvent.click(requiredCheckbox);
    expect(requiredCheckbox).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /모집 작성/ }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]?.questionItems).toEqual([
      { id: null, text: '지원 동기를 알려주세요', type: 'TEXT', required: false, choices: [] },
    ]);
  });

  it('선택지가 1개인 객관식은 검증 메시지로 제출이 막힌다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RecruitmentForm mode="create" onSubmit={onSubmit} isPending={false} />);

    fillCreateBasics();
    addQuestion('학년을 선택해주세요');
    fireEvent.click(screen.getByLabelText('객관식(단일 선택)'));
    fireEvent.change(screen.getByPlaceholderText('선택지 1'), { target: { value: '1학년' } });

    const choiceRemoveButtons = screen.getAllByLabelText('선택지 삭제');
    fireEvent.click(choiceRemoveButtons[1] as HTMLElement);
    expect(screen.getByText('선택지를 2개 이상 등록해주세요.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /모집 작성/ }));

    expect(
      await screen.findByText('선택형 질문은 선택지를 2개 이상 등록해야 합니다.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('같은 선택지 내용을 두 번 입력하면 제출이 막힌다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RecruitmentForm mode="create" onSubmit={onSubmit} isPending={false} />);

    fillCreateBasics();
    addQuestion('관심 분야를 골라주세요');
    fireEvent.click(screen.getByLabelText('객관식(복수 선택)'));
    fireEvent.change(screen.getByPlaceholderText('선택지 1'), { target: { value: '백엔드' } });
    fireEvent.change(screen.getByPlaceholderText('선택지 2'), { target: { value: '백엔드' } });

    fireEvent.click(screen.getByRole('button', { name: /모집 작성/ }));

    expect(
      await screen.findByText('같은 질문 안에서 선택지 내용이 중복될 수 없습니다.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('자체 폼에서 질문을 모두 지우면 제출이 막힌다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RecruitmentForm mode="create" onSubmit={onSubmit} isPending={false} />);

    fillCreateBasics();
    addQuestion('지원 동기를 알려주세요');
    fireEvent.click(screen.getByLabelText('삭제'));

    fireEvent.click(screen.getByRole('button', { name: /모집 작성/ }));

    expect(
      await screen.findByText('자체 폼 모집은 질문을 최소 1개 이상 등록해야 합니다.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('수정 모드에서 자체 폼 질문을 모두 지우면 제출이 막힌다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <RecruitmentForm
        mode="edit"
        initialValues={{
          ...baseRecruitmentDetail,
          questions: ['지원 동기는?'],
          questionItems: [
            { id: 'question-1', text: '지원 동기는?', type: 'TEXT', required: true, choices: [] },
          ],
        }}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    fireEvent.click(screen.getByLabelText('삭제'));
    fireEvent.click(screen.getByRole('button', { name: /수정 저장/ }));

    expect(
      await screen.findByText('자체 폼 모집은 질문을 최소 1개 이상 등록해야 합니다.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('수정 모드는 기존 질문과 선택지의 id 를 보존해 제출한다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <RecruitmentForm
        mode="edit"
        initialValues={{
          ...baseRecruitmentDetail,
          questions: ['학년은?'],
          questionItems: [
            {
              id: 'question-1',
              text: '학년은?',
              type: 'SINGLE_CHOICE',
              required: true,
              choices: [
                { id: 'choice-1', label: '1학년' },
                { id: 'choice-2', label: '2학년' },
              ],
            },
          ],
        }}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    expect(screen.getByLabelText('객관식(단일 선택)')).toBeChecked();
    fireEvent.change(screen.getByDisplayValue('학년은?'), {
      target: { value: '몇 학년인가요?' },
    });

    fireEvent.click(screen.getByRole('button', { name: /수정 저장/ }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]?.questionItems).toEqual([
      {
        id: 'question-1',
        text: '몇 학년인가요?',
        type: 'SINGLE_CHOICE',
        required: true,
        choices: [
          { id: 'choice-1', label: '1학년' },
          { id: 'choice-2', label: '2학년' },
        ],
      },
    ]);
  });

  // 구 BE 는 questionItems 를 미지 필드로 버리고, questions 누락을 "질문 미변경"으로 처리해 200 을 준다.
  // 즉 빌더를 열어두면 리더의 질문 편집이 조용히 사라진다 — 편집 자체를 막는 편이 정직하다.
  // ([] 는 신 BE 의 외부 폼 응답이므로 undefined 와 반드시 구분해야 한다.)
  it('questionItems 가 없는 상세(구 BE)면 수정 모드에서 질문 편집 UI 대신 안내를 보여준다', () => {
    render(
      <RecruitmentForm
        mode="edit"
        initialValues={{ ...baseRecruitmentDetail, questions: ['지원 동기는?'] }}
        onSubmit={vi.fn()}
        isPending={false}
      />,
    );

    expect(screen.queryByRole('button', { name: '+ 질문 추가' })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('지원 동기는?')).not.toBeInTheDocument();
    expect(
      screen.getByText(/서버 업데이트 이후에 질문을 수정할 수 있습니다/),
    ).toBeInTheDocument();
    // 현재 질문은 읽기 전용으로 확인할 수 있다.
    expect(screen.getByText('지원 동기는?')).toBeInTheDocument();
  });

  it('구 BE 상세로 수정 저장하면 payload 에 questionItems 키가 아예 없다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <RecruitmentForm
        mode="edit"
        initialValues={{ ...baseRecruitmentDetail, questions: ['지원 동기는?'] }}
        onSubmit={onSubmit}
        isPending={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /수정 저장/ }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const submittedValues = onSubmit.mock.calls[0]?.[0];
    // 보내봐야 구 BE 가 버리므로 키 자체를 싣지 않는다(JSON.stringify 가 undefined 를 제거한다).
    expect(submittedValues).not.toHaveProperty('questionItems');
    // 나머지 항목은 정상 저장된다.
    expect(submittedValues).toMatchObject({ title: '기존 모집', capacity: 5 });
  });

  it('questionItems 가 빈 배열(신 BE 외부 폼)이면 구 BE 안내를 띄우지 않는다', () => {
    render(
      <RecruitmentForm
        mode="edit"
        initialValues={{
          ...baseRecruitmentDetail,
          applicationMode: 'EXTERNAL',
          externalFormUrl: 'https://forms.example.com/apply',
          questions: [],
          questionItems: [],
        }}
        onSubmit={vi.fn()}
        isPending={false}
      />,
    );

    expect(
      screen.queryByText(/서버 업데이트 이후에 질문을 수정할 수 있습니다/),
    ).not.toBeInTheDocument();
  });

  it('선택형에서 주관식으로 되돌리면 선택지 초안은 화면에서 감춰지고 빈 배열로 제출된다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RecruitmentForm mode="create" onSubmit={onSubmit} isPending={false} />);

    fillCreateBasics();
    addQuestion('지원 동기를 알려주세요');
    fireEvent.click(screen.getByLabelText('객관식(단일 선택)'));
    fireEvent.change(screen.getByPlaceholderText('선택지 1'), { target: { value: '백엔드' } });
    fireEvent.change(screen.getByPlaceholderText('선택지 2'), { target: { value: '프론트엔드' } });

    fireEvent.click(screen.getByLabelText('주관식'));
    expect(screen.queryByPlaceholderText('선택지 1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /모집 작성/ }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]?.questionItems).toEqual([
      { id: null, text: '지원 동기를 알려주세요', type: 'TEXT', required: true, choices: [] },
    ]);
  });
});
