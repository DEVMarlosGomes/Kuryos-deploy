/**
 * Mascaras de digitacao pt-BR (moeda e milhar) extraidas do formulario de
 * criacao de projeto do CRM1Page para reutilizacao em qualquer formulario
 * que colete valores monetarios ou volumes inteiros.
 *
 * Padrao de uso: <Input type="text" inputMode="decimal|numeric"> com
 * onChange armazenando o texto cru e onBlur reformatando via fmt*Display.
 * O valor numerico real (para enviar a API) vem de parse*Input.
 */

export const DEFAULT_PRICE_DISPLAY = "0,00";
export const DEFAULT_VOLUME_DISPLAY = "0.000";

/** Formata um valor digitado livre para o padrao pt-BR de moeda. */
export const fmtPriceDisplay = (value) => {
  if (value === "" || value == null) return "";
  const parsed = parseFloat(String(value).replace(/\./g, "").replace(",", "."));
  if (isNaN(parsed)) return "";
  return parsed.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** Formata um valor digitado livre para o padrao pt-BR de milhar. */
export const fmtVolumeDisplay = (value) => {
  if (value === "" || value == null) return "";
  const parsed = parseInt(String(value).replace(/\./g, "").replace(/,/g, ""), 10);
  if (isNaN(parsed)) return "";
  return parsed.toLocaleString("pt-BR");
};

/** Converte um texto no padrao pt-BR de moeda de volta para float ou null. */
export const parsePriceInput = (value) => {
  if (!value) return null;
  return parseFloat(String(value).replace(/\./g, "").replace(",", ".")) || null;
};

/** Converte um texto no padrao pt-BR de milhar de volta para inteiro ou null. */
export const parseVolumeInput = (value) => {
  if (!value) return null;
  return parseInt(String(value).replace(/\./g, "").replace(/,/g, ""), 10) || null;
};

/** Semeia o campo com a mascara padrao sem persistir zero automaticamente. */
export const seedPriceDisplay = (value) => (
  value === "" || value == null ? DEFAULT_PRICE_DISPLAY : String(value)
);

/** Semeia o campo com a mascara padrao sem persistir zero automaticamente. */
export const seedVolumeDisplay = (value) => (
  value === "" || value == null ? DEFAULT_VOLUME_DISPLAY : String(value)
);
