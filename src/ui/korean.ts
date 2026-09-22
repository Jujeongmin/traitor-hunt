// 을 after a final consonant, 를 after a vowel (a word that does not end in Hangul takes 를).
export function objectParticle(word: string): string {
  const code = word.trim().slice(-1).charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "를";
  return code % 28 === 0 ? "를" : "을";
}
