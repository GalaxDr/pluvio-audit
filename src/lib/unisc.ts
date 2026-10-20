import { buscarJson, paraInstante, paraMm } from "./util";

const BASE = "https://estacaobackend.unisc.br";

export type EstacaoUnisc = {
  cod: number;
  nome: string;
  slug: string;
  lat: number;
  lon: number;
  ativa: boolean;
};

export type LeituraUnisc = {
  instante: number | null; // ms UTC
  diaMm: number | null;
  h24Mm: number | null;
  d7Mm: number | null;
  mesMm: number | null;
  d30Mm: number | null;
  temperatura: string | null;
  umidade: string | null;
};

type EstacaoApi = {
  cod_estacao_meteorologica: number;
  nome: string;
  slug: string;
  latitude: string;
  longitude: string;
  status: boolean;
};

export async function listarEstacoesUnisc(): Promise<EstacaoUnisc[]> {
  const dados = await buscarJson<EstacaoApi[]>(`${BASE}/estacao-meteorologica`, 3600);
  return dados
    .map((e) => ({
      cod: e.cod_estacao_meteorologica,
      nome: e.nome.trim(),
      slug: e.slug,
      lat: Number(e.latitude),
      lon: Number(e.longitude),
      ativa: e.status,
    }))
    .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

type LeituraApi = {
  dth_leitura?: string;
  temperatura?: string;
  umidade?: string;
  dados_especificos_elysios_resumo_leitura?: Record<string, unknown> | null;
};

export async function ultimaLeituraUnisc(cod: number): Promise<LeituraUnisc> {
  const d = await buscarJson<LeituraApi>(
    `${BASE}/gerenciamento-estacao-meteorologica/resumoUltimaLeitura/codEstacao/${cod}`,
    300,
    15_000,
  );
  const e = d.dados_especificos_elysios_resumo_leitura ?? {};
  return {
    instante: paraInstante(d.dth_leitura),
    diaMm: paraMm(e.pluviosidade_acumulada_dia),
    h24Mm: paraMm(e.pluviosidade_acumulada_ultimas_24_horas),
    d7Mm: paraMm(e.pluviosidade_acumulada_ultimos_7_dias),
    mesMm: paraMm(e.pluviosidade_acumulada_mes),
    d30Mm: paraMm(e.pluviosidade_acumulada_ultimos_30_dias),
    temperatura: d.temperatura ?? null,
    umidade: d.umidade ?? null,
  };
}
