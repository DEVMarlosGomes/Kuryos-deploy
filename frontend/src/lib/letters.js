/**
 * Converte um índice (0-based) em letras estilo coluna de planilha: A, B, ... Z, AA, AB, ... ZZ, AAA...
 * Usado para nomear variações de amostra e fases de manipulação sem estourar após a 26ª (bug de
 * `String.fromCharCode(65 + index)`, que gera caracteres não-alfabéticos além do índice 25).
 * @param {number} index - índice 0-based
 * @param {"upper"|"lower"} [caseMode="upper"]
 * @returns {string}
 */
export function indexToLetters(index, caseMode = "upper") {
  let n = Math.max(0, Math.floor(index));
  let result = "";
  const base = caseMode === "lower" ? 97 : 65;
  do {
    result = String.fromCharCode(base + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}
