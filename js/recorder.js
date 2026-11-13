// 연습 중 10Hz로 지표 샘플을 쌓아 두는 기록기
export function createRecorder() {
  const list = [];
  return {
    push(sample) { list.push(sample); },
    samples() { return list.slice(); },
  };
}
