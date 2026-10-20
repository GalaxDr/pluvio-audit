export type Nivel = "ERRO" | "AVISO" | "INFO";
export type Achado = { nivel: Nivel; msg: string };
/** Ponto horário. t = fim da hora (ms UTC). v = mm na hora, null = sem dado. */
export type Ponto = { t: number; v: number | null };

export const HORA = 3_600_000;
export const BRT_OFFSET = -3 * HORA; // Brasília, sem horário de verão
export const ORDEM: Record<Nivel, number> = { ERRO: 0, AVISO: 1, INFO: 2 };

/** '12.5 mm', '12,5mm', 12.5, '1.234,5' -> número. null se ilegível. */
export function paraMm(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const achado = String(valor).match(/-?\d[\d.,]*/);
  if (!achado) return null;
  let num = achado[0].replace(/[.,]+$/, "");
  if (num.includes(",") && num.includes(".")) num = num.replace(/\./g, "").replace(",", ".");
  else if (num.includes(",")) num = num.replace(",", ".");
  const n = Number(num);
  return Number.isFinite(n) ? n : null;
}

export function paraInstante(texto: unknown): number | null {
  if (!texto) return null;
  let s = String(texto);
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += "Z";
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

export function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (g: number) => (g * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Componentes da data em Brasília. */
export function brt(t: number) {
  const d = new Date(t + BRT_OFFSET);
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth(), dia: d.getUTCDate(), hora: d.getUTCHours() };
}

/** Meia-noite (Brasília) do dia de t, em ms UTC. */
export function meiaNoiteBrt(t: number): number {
  const { ano, mes, dia } = brt(t);
  return Date.UTC(ano, mes, dia) - BRT_OFFSET;
}

export function inicioMesBrt(t: number): number {
  const { ano, mes } = brt(t);
  return Date.UTC(ano, mes, 1) - BRT_OFFSET;
}

export function fmtBrt(t: number | null, comAno = false): string {
  if (t === null) return "n/d";
  return new Date(t).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    ...(comAno ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function mm(v: number | null | undefined, casas = 1): string {
  return v === null || v === undefined ? "n/d" : `${v.toFixed(casas)} mm`;
}

export async function buscarJson<T>(url: string, revalidate: number, timeoutMs = 20_000): Promise<T> {
  const resp = await fetch(url, {
    next: { revalidate },
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "auditoria-pluviometrica/web" },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} em ${new URL(url).host}`);
  return (await resp.json()) as T;
}

/** Map com no máximo `limite` promessas ao mesmo tempo. */
export async function mapLimitado<T, R>(itens: T[], limite: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(itens.length);
  let i = 0;
  const trab = async () => {
    while (i < itens.length) {
      const k = i++;
      out[k] = await fn(itens[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trab));
  return out;
}

export function erroMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
