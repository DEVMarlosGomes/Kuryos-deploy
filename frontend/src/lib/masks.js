/**
 * Máscaras de digitação pt-BR (moeda e milhar) — extraídas do formulário de
 * criação de projeto do CRM1Page (já em produção) para reutilização em
 * qualquer formulário que colete valores monetários ou volumes inteiros.
 *
 * Padrão de uso: <Input type="text" inputMode="decimal|numeric"> com
 * onChange armazenando o texto cru e onBlur reformatando via fmt*Display.
 * O valor numérico real (para enviar à API) vem de parse*Input.
 */

/** Formata um valor digitado (livre) para o padrão pt-BR de moeda: "1234,5" -> "1.234,50" */
export const fmtPriceDisplay = (v) => {
  if (v === "" || v == null) return "";
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  if (isNaN(n)) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** Formata um valor digitado (livre) para o padrão pt-BR de milhar: "15000" -> "15.000" */
export const fmtVolumeDisplay = (v) => {
  if (v === "" || v == null) return "";
  const n = parseInt(String(v).replace(/\./g, "").replace(/,/g, ""), 10);
  if (isNaN(n)) return "";
  return n.toLocaleString("pt-BR");
};

/** Converte um texto no padrão pt-BR de moeda de volta para float (ou null). */
export const parsePriceInput = (str) => {
  if (!str) return null;
  return parseFloat(String(str).replace(/\./g, "").replace(",", ".")) || null;
};

/** Converte um texto no padrão pt-BR de milhar de volta para inteiro (ou null). */
export const parseVolumeInput = (str) => {
  if (!str) return null;
  return parseInt(String(str).replace(/\./g, "").replace(/,/g, ""), 10) || null;
};
