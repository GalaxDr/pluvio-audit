/**
 * Regras da auditoria (porte do script Python). Detecta contradição, dado parado
 * e divergência entre fontes. Coerência não prova exatidão.
 */
import type { LeituraUnisc } from "./unisc";
import { Achado, HORA, Ponto, fmtBrt, inicioMesBrt, meiaNoiteBrt } from "./util";

export const CFG = {
  toleranciaMm: 0.5, // folga entre acumulados da mesma estação
  atrasoMaxMin: 60, // UNISC: leitura mais velha = suspeita
  atrasoRefMin: 180, // CEMADEN: último ponto mais velho
  futuroMaxMin: 5,
  chuvaSuspeitaMm: 450,
  coberturaMin: 0.85,
  raioCemadenKm: 25,
  // divergência tolerada: max(piso do período * fator, rel * maior valor)
  pisoPeriodoMm: { hoje: 2, "24h": 2, "7 dias": 5, "mês": 10, "30 dias": 10 } as Record<string, number>,
  tolEstacao: { fatorPiso: 1, rel: 0.3 },
  tolModelo: { fatorPiso: 2, rel: 0.6 },
  // pluviômetro travado: UNISC ~0 em 7d enquanto a referência viu isso ou mais
  travadoRefMm: 10,
  // série "morta": 30d < max(2 mm, 5% do modelo) com modelo >= 50 mm
  mortaModeloMinMm: 50,
  mortaFracao: 0.05,
};

/** Pluviômetro que soma quase nada enquanto o modelo viu muita chuva: provável travamento. */
export function pareceMorta(soma30: number, modelo30: number | null): boolean {
  return modelo30 !== null && modelo30 >= CFG.mortaModeloMinMm && soma30 < Math.max(2, CFG.mortaFracao * modelo30);
}

export type Periodo = "hoje" | "24h" | "7 dias" | "mês" | "30 dias";
export type Janela = { soma: number; validos: number; esperados: number; cobertura: number };
export type Comparacao = {
  periodo: Periodo;
  unisc: number | null;
  ref: Janela;
  estado: "ok" | "diverge" | "sem-cobertura" | "sem-unisc";
  tolerancia: number;
};
export type TipoRef = "estacao" | "modelo";

/** Soma pontos com ini <= t <= fim. Hora sem dado NÃO conta como zero. */
export function janela(pontos: Ponto[], ini: number, fim: number): Janela {
  const esperados = Math.floor((fim - ini) / HORA) + 1;
  let soma = 0;
  let validos = 0;
  for (const p of pontos) {
    if (p.t >= ini && p.t <= fim && p.v !== null) {
      soma += p.v;
      validos++;
    }
  }
  return { soma, validos, esperados, cobertura: esperados > 0 ? validos / esperados : 0 };
}

export function validarUnisc(l: LeituraUnisc, agora: number): Achado[] {
  const p: Achado[] = [];
  const campos: [string, number | null][] = [
    ["do dia", l.diaMm], ["de 24h", l.h24Mm], ["de 7 dias", l.d7Mm], ["do mês", l.mesMm], ["de 30 dias", l.d30Mm],
  ];
  for (const [nome, v] of campos) {
    if (v === null) p.push({ nivel: "ERRO", msg: `UNISC: acumulado ${nome} ausente ou ilegível.` });
    else if (v < 0) p.push({ nivel: "ERRO", msg: `UNISC: acumulado ${nome} negativo (${v} mm).` });
  }

  if (l.instante === null) {
    p.push({ nivel: "ERRO", msg: "UNISC: data/hora da leitura ausente ou inválida." });
  } else {
    const idade = (agora - l.instante) / 60_000;
    if (idade > CFG.atrasoMaxMin)
      p.push({ nivel: "ERRO", msg: `UNISC: leitura com ${idadeTxt(idade)} de atraso (limite ${CFG.atrasoMaxMin} min): estação offline ou dado parado.` });
    else if (idade < -CFG.futuroMaxMin)
      p.push({ nivel: "AVISO", msg: `UNISC: leitura ${Math.round(-idade)} min no futuro (relógio da estação ou fuso?).` });
  }

  const { diaMm: dia, h24Mm: h24, d7Mm: d7, mesMm: mes, d30Mm: d30 } = l;
  const maior = (a: number | null, b: number | null) => a !== null && b !== null && a > b + CFG.toleranciaMm;
  const regra = (a: number | null, b: number | null, txt: string) => {
    if (maior(a, b)) p.push({ nivel: "ERRO", msg: `UNISC: ${txt} (${a} > ${b} mm).` });
  };
  regra(dia, h24, "chuva do dia maior que a de 24h");
  regra(dia, mes, "chuva do dia maior que a do mês");
  regra(h24, d7, "24h maior que 7 dias");
  regra(d7, d30, "7 dias maior que 30 dias");
  if (l.instante !== null && new Date(l.instante - 3 * HORA).getUTCDate() <= 30) regra(mes, d30, "mês maior que 30 dias");
  if (h24 !== null && h24 > CFG.chuvaSuspeitaMm)
    p.push({ nivel: "AVISO", msg: `UNISC: 24h muito alto (${h24} mm): confira manualmente.` });
  if (d30 === 0) p.push({ nivel: "AVISO", msg: "UNISC: 30 dias zerado (período seco ou pluviômetro travado)." });
  return p;
}

export function validarSerie(nome: string, pontos: Ponto[], agora: number): Achado[] {
  const p: Achado[] = [];
  if (!pontos.length) return [{ nivel: "AVISO", msg: `${nome}: série vazia.` }];
  const ultimo = pontos[pontos.length - 1].t;
  const idade = (agora - ultimo) / 60_000;
  if (idade > CFG.atrasoRefMin)
    p.push({ nivel: "AVISO", msg: `${nome}: último ponto é de ${fmtBrt(ultimo)} (${idadeTxt(idade)} atrás).` });

  let finais = 0;
  for (let i = pontos.length - 1; i >= 0 && pontos[i].v === null; i--) finais++;
  if (finais >= 3) p.push({ nivel: "AVISO", msg: `${nome}: as últimas ${finais} horas estão sem dado.` });

  const validos = pontos.filter((x) => x.v !== null).length;
  if (validos / pontos.length < 0.9)
    p.push({ nivel: "AVISO", msg: `${nome}: só ${validos}/${pontos.length} horas com dado.` });
  if (pontos.some((x) => x.v !== null && x.v < 0)) p.push({ nivel: "AVISO", msg: `${nome}: há valores negativos.` });
  return p;
}

/** Compara acumulados da UNISC com a soma horária de uma referência, terminando na hora da leitura UNISC. */
export function cruzar(l: LeituraUnisc, pontos: Ponto[], tipo: TipoRef): Comparacao[] {
  if (!pontos.length || l.instante === null) return [];

  // Fim = hora cheia da leitura UNISC (ou último ponto da referência, se for antes).
  const fim = Math.min(Math.floor(l.instante / HORA) * HORA, pontos[pontos.length - 1].t);
  // Pontos são "fim da hora": a 1ª hora do dia termina à 01:00.
  const defs: [Periodo, number | null, number][] = [
    ["hoje", l.diaMm, meiaNoiteBrt(fim) + HORA],
    ["24h", l.h24Mm, fim - 23 * HORA],
    ["7 dias", l.d7Mm, fim - 167 * HORA],
    ["mês", l.mesMm, inicioMesBrt(fim) + HORA],
    ["30 dias", l.d30Mm, fim - 719 * HORA],
  ];
  const tol = tipo === "estacao" ? CFG.tolEstacao : CFG.tolModelo;

  return defs.map(([periodo, unisc, ini]): Comparacao => {
    const ref = ini > fim ? { soma: 0, validos: 0, esperados: 0, cobertura: 1 } : janela(pontos, ini, fim);
    const tolerancia = Math.max(CFG.pisoPeriodoMm[periodo] * tol.fatorPiso, tol.rel * Math.max(unisc ?? 0, ref.soma));
    if (unisc === null) return { periodo, unisc, ref, estado: "sem-unisc", tolerancia };
    if (ref.cobertura < CFG.coberturaMin) return { periodo, unisc, ref, estado: "sem-cobertura", tolerancia };
    const diverge = Math.abs(ref.soma - unisc) > tolerancia;
    return { periodo, unisc, ref, estado: diverge ? "diverge" : "ok", tolerancia };
  });
}

type RefParaConsenso = { nome: string; tipo: TipoRef; comparacoes: Comparacao[] };

/**
 * Junta as referências por período. A UNISC só leva AVISO quando diverge da MAIORIA
 * das fontes válidas, todas do mesmo lado (todas acima ou todas abaixo), com ao menos
 * um pluviômetro entre elas. UNISC entre as fontes = dentro da faixa. Uma referência que
 * discorda da UNISC e das outras fontes é marcada como suspeita ela mesma.
 */
export function consenso(refs: RefParaConsenso[]): Achado[] {
  const achados: Achado[] = [];
  const periodos: Periodo[] = ["hoje", "24h", "7 dias", "mês", "30 dias"];
  const refsSuspeitas = new Set<string>();

  for (const periodo of periodos) {
    const validas = refs
      .map((r) => ({ r, c: r.comparacoes.find((c) => c.periodo === periodo) }))
      .filter((x): x is { r: RefParaConsenso; c: Comparacao } => x.c?.estado === "ok" || x.c?.estado === "diverge");
    if (!validas.length) continue;
    const div = validas.filter((x) => x.c.estado === "diverge");
    if (!div.length) continue;
    const unisc = validas[0].c.unisc!;
    const lista = div.map((x) => `${x.r.nome} ${x.c.ref.soma.toFixed(1)}`).join("; ");
    const temPluviometro = validas.some((x) => x.r.tipo === "estacao");
    const mesmoLado = div.every((x) => x.c.ref.soma > unisc) || div.every((x) => x.c.ref.soma < unisc);

    if (div.length * 2 > validas.length && temPluviometro && mesmoLado) {
      achados.push({
        nivel: "AVISO",
        msg: `UNISC diverge da maioria das fontes em ${periodo}: UNISC ${unisc.toFixed(1)} mm × ${lista} mm (${div.length}/${validas.length} fontes).`,
      });
      // Padrão clássico de falha: UNISC parada em ~0 enquanto os vizinhos mediram chuva.
      const medianaRef = mediana(validas.map((x) => x.c.ref.soma));
      if (periodo === "7 dias" && unisc < 0.5 && medianaRef >= CFG.travadoRefMm)
        achados.push({
          nivel: "ERRO",
          msg: `Possível pluviômetro travado/entupido: UNISC marcou ${unisc.toFixed(1)} mm em 7 dias; mediana das referências ${medianaRef.toFixed(1)} mm.`,
        });
    } else if (!mesmoLado) {
      achados.push({
        nivel: "INFO",
        msg: `Em ${periodo}, fontes espalhadas e UNISC (${unisc.toFixed(1)} mm) fica no meio delas; divergem: ${lista} mm.`,
      });
    } else {
      achados.push({
        nivel: "INFO",
        msg: `Em ${periodo}, UNISC (${unisc.toFixed(1)} mm) concorda com a maioria; divergem: ${lista} mm.`,
      });
      // Referência isolada contra UNISC + maioria: provável problema nela.
      if (validas.length >= 3) for (const x of div) refsSuspeitas.add(x.r.nome);
    }
  }
  for (const nome of refsSuspeitas)
    achados.push({ nivel: "INFO", msg: `Referência suspeita: ${nome} discorda da UNISC e das demais fontes. Pode ser ela a falhar.` });
  return achados;
}

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Soma diária (dia de Brasília) dos últimos `dias` dias. */
export function porDia(pontos: Ponto[], dias: number, fim: number): { dia: number; soma: number; cobertura: number }[] {
  const hoje = meiaNoiteBrt(fim);
  return Array.from({ length: dias }, (_, i) => {
    const d = hoje - (dias - 1 - i) * 24 * HORA;
    const j = janela(pontos, d + HORA, Math.min(d + 24 * HORA, fim));
    return { dia: d, soma: j.soma, cobertura: j.cobertura };
  });
}

function idadeTxt(min: number): string {
  if (min < 120) return `${Math.round(min)} min`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} dias`;
}
