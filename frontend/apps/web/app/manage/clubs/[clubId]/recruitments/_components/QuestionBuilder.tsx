'use client';

type QuestionBuilderProps = {
  questions: string[];
  onChange: (questions: string[]) => void;
};

export function QuestionBuilder({ questions, onChange }: QuestionBuilderProps) {
  function handleAdd() {
    onChange([...questions, '']);
  }

  function handleRemove(targetIndex: number) {
    onChange(questions.filter((_, index) => index !== targetIndex));
  }

  function handleChange(targetIndex: number, value: string) {
    onChange(questions.map((question, index) => (index === targetIndex ? value : question)));
  }

  function handleMoveUp(targetIndex: number) {
    if (targetIndex === 0) return;
    const nextQuestions = questions.slice();
    const upper = nextQuestions[targetIndex - 1];
    const current = nextQuestions[targetIndex];
    if (upper === undefined || current === undefined) return;
    nextQuestions[targetIndex - 1] = current;
    nextQuestions[targetIndex] = upper;
    onChange(nextQuestions);
  }

  function handleMoveDown(targetIndex: number) {
    if (targetIndex === questions.length - 1) return;
    const nextQuestions = questions.slice();
    const lower = nextQuestions[targetIndex + 1];
    const current = nextQuestions[targetIndex];
    if (lower === undefined || current === undefined) return;
    nextQuestions[targetIndex + 1] = current;
    nextQuestions[targetIndex] = lower;
    onChange(nextQuestions);
  }

  return (
    <div className="space-y-3">
      {questions.map((question, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-right text-sm text-slate-400">{index + 1}.</span>
          <input
            type="text"
            value={question}
            onChange={(event) => handleChange(index, event.target.value)}
            placeholder={`질문 ${index + 1}을 입력하세요`}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => handleMoveUp(index)}
              disabled={index === 0}
              className="rounded px-1.5 py-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
              aria-label="위로 이동"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => handleMoveDown(index)}
              disabled={index === questions.length - 1}
              className="rounded px-1.5 py-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
              aria-label="아래로 이동"
            >
              ▼
            </button>
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className="rounded px-1.5 py-1 text-rose-400 hover:bg-rose-50"
              aria-label="삭제"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={handleAdd}
        className="mt-1 rounded-md border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700"
      >
        + 질문 추가
      </button>
    </div>
  );
}
