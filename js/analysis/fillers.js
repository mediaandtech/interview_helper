// 군말(음, 어, 그, 저) 세기: 음성 인식 텍스트에서 단독 어절만 셉니다
const FILLERS = new Set(['음', '어', '그', '저']);

export function countFillers(text) {
  return text.split(/\s+/)
    .map((w) => w.replace(/[.…,~!?]+$/u, ''))
    .filter((w) => FILLERS.has(w)).length;
}
