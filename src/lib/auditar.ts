import { CFG, Comparacao, consenso, cruzar, janela, pareceMorta, porDia, validarSerie, validarUnisc } from "./audit";
import { EstacaoCemaden, listarEstacoesCemadenRegiao, serieCemaden } from "./cemaden";
import { serieOpenMeteo } from "./openmeteo";
import { EstacaoUnisc, LeituraUnisc, listarEstacoesUnisc, ultimaLeituraUnisc } from "./unisc";
import { Achado, HORA, ORDEM, Ponto, distanciaKm, erroMsg, mapLimitado } from "./util";

export type Status = "ok" | "suspeita" | "falha";

export type Referencia = {
  nome: string;
  tipo: "estacao" | "modelo";
  distanciaKm: number | null;
  idCemaden?: number;
  comparacoes: Comparacao[];
  erro?: string;
};

export type Auditoria = {
  estacao: EstacaoUnisc;
  leitura: LeituraUnisc | null;
  status: Status;
  achados: Achado[];
  referencias: Referencia[];
  vizinhosCemaden: (EstacaoCemaden & { distanciaKm: number })[];
  diario: { nome: string; dias: { dia: number; soma: number; cobertura: number }[] }[];
  geradoEm: number;
};

export function statusDe(achados: Achado[]): Status {
  if (achados.some((a) => a.nivel === "ERRO")) return "falha";
  if (achados.some((a) => a.nivel === "AVISO")) return "suspeita";
  return "ok";
}

const MAX_CEMADEN_REF = 2; // compara com as 2 estações CEMADEN boas mais próximas
const CANDIDATAS_CEMADEN = 4; // baixa até 4 para sobrar alguma se as mais perto estiverem paradas

export async function auditarEstacao(
  est: EstacaoUnisc,
  cemaden: EstacaoCemaden[],
  opts: { diario?: boolean } = {},
): Promise<Auditoria> {
  const agora = Date.now();
  const achados: Achado[] = [];
  const referencias: Referencia[] = [];
  const diario: Auditoria["diario"] = [];

  const vizinhosCemaden = cemaden
    .map((c) => ({ ...c, distanciaKm: distanciaKm(est.lat, est.lon, c.lat, c.lon) }))
    .filter((c) => c.distanciaKm <= CFG.raioCemadenKm)
    .sort((a, b) => a.distanciaKm - b.distanciaKm);

  let leitura: LeituraUnisc | null = null;
  try {
    leitura = await ultimaLeituraUnisc(est.cod);
    achados.push(...validarUnisc(leitura, agora));
  } catch (e) {
    achados.push({ nivel: "ERRO", msg: `UNISC sem resposta: ${erroMsg(e)}` });
  }

  const fimDiario = leitura?.instante ? Math.floor(leitura.instante / HORA) * HORA : Math.floor(agora / HORA) * HORA;
  const addRef = (nome: string, tipo: Referencia["tipo"], dist: number | null, pontos: Ponto[], extra: Partial<Referencia> = {}) => {
    if (opts.diario) diario.push({ nome, dias: porDia(pontos, 30, fimDiario) });
    const comparacoes = leitura ? cruzar(leitura, pontos, tipo) : [];
    referencias.push({ nome, tipo, distanciaKm: dist, comparacoes, ...extra });
  };

  const [series, om] = await Promise.all([
    Promise.all(
      vizinhosCemaden.slice(0, CANDIDATAS_CEMADEN).map((c) =>
        serieCemaden(c).then(
          (s) => ({ c, s, erro: null as string | null }),
          (e) => ({ c, s: null, erro: erroMsg(e) }),
        ),
      ),
    ),
    serieOpenMeteo(est.lat, est.lon).then(
      (p) => ({ p, erro: null as string | null }),
      (e) => ({ p: null, erro: erroMsg(e) }),
    ),
  ]);

  // 30 dias do modelo: régua para achar pluviômetro "morto" (UNISC ou CEMADEN).
  const ultimos30 = (p: Ponto[]) => janela(p, p[p.length - 1].t - 719 * HORA, p[p.length - 1].t);
  const modelo30 = om.p?.length ? ultimos30(om.p).soma : null;

  let usadas = 0;
  for (const { c, s, erro } of series) {
    if (usadas >= MAX_CEMADEN_REF) break;
    const nome = `CEMADEN ${c.cidade} – ${c.nome}`;
    if (!s || !s.pontos.length) {
      achados.push({ nivel: "INFO", msg: `${nome} indisponível: ${erro ?? "série vazia"}` });
      continue;
    }
    const j30 = ultimos30(s.pontos);
    if (j30.cobertura < 0.5) {
      achados.push({ nivel: "INFO", msg: `${nome} descartada: só ${j30.validos}/${j30.esperados} horas com dado em 30 dias.` });
      continue;
    }
    if (j30.cobertura >= CFG.coberturaMin && pareceMorta(j30.soma, modelo30)) {
      achados.push({
        nivel: "INFO",
        msg: `${nome} descartada: ${j30.soma.toFixed(1)} mm em 30 dias contra ${modelo30!.toFixed(0)} mm do modelo (parece parada).`,
      });
      continue;
    }
    // Problema da referência não é problema da UNISC: rebaixa para INFO.
    achados.push(...validarSerie(nome, s.pontos, agora).map((a) => ({ ...a, nivel: "INFO" as const })));
    addRef(nome, "estacao", c.distanciaKm, s.pontos, { idCemaden: c.id });
    usadas++;
  }
  if (!usadas)
    achados.push({ nivel: "INFO", msg: `Nenhuma estação CEMADEN boa num raio de ${CFG.raioCemadenKm} km: só o modelo Open-Meteo serve de referência.` });

  if (om.p) addRef("Open-Meteo (modelo)", "modelo", null, om.p);
  else achados.push({ nivel: "INFO", msg: `Open-Meteo indisponível: ${om.erro}` });

  if (leitura?.d30Mm != null && pareceMorta(leitura.d30Mm, modelo30))
    achados.push({
      nivel: "ERRO",
      msg: `Pluviômetro UNISC provavelmente travado: ${leitura.d30Mm.toFixed(1)} mm em 30 dias contra ${modelo30!.toFixed(0)} mm do modelo.`,
    });

  achados.push(...consenso(referencias));
  achados.sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel]);
  return { estacao: est, leitura, status: statusDe(achados), achados, referencias, vizinhosCemaden, diario, geradoEm: agora };
}

export async function carregarBase() {
  const [unisc, cemaden] = await Promise.all([
    listarEstacoesUnisc(),
    listarEstacoesCemadenRegiao().catch(() => [] as EstacaoCemaden[]),
  ]);
  return { unisc, cemaden };
}

export async function auditarTodas(): Promise<Auditoria[]> {
  const { unisc, cemaden } = await carregarBase();
  return mapLimitado(unisc, 5, (e) => auditarEstacao(e, cemaden));
}
