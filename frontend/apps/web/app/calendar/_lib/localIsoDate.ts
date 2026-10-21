// 기기 시간대 기준 'YYYY-MM-DD' — 캘린더 날짜 칸(cell.iso)과 같은 꼴. 서버(페이지)와 브라우저(CalendarPage)가 함께 쓴다.
export function toLocalIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
