/**
 * CEMADEN. Dois endpoints NÃO documentados (podem mudar sem aviso):
 *  - getJson2.php?uf=RS  -> lista de estações (sem coordenadas)
 *  - MapaInterativoWS/resources/horario/{id}/{horas} -> série horária + coordenadas
 * Rótulos de hora do Mapa Interativo estão em UTC (conferido: último rótulo = hora UTC atual).
 */
import { HORA, Ponto, buscarJson, mapLimitado, paraMm } from "./util";

const URL_LISTA = "https://resources.cemaden.gov.br/graficos/interativo/getJson2.php?uf=RS";
const URL_HORARIO = "https://mapservices.cemaden.gov.br/MapaInterativoWS/resources/horario";

/** Municípios da região das estações UNISC (Vale do Rio Pardo / Taquari). */
const MUNICIPIOS_REGIAO = [
  "CANDELARIA", "SANTA CRUZ DO SUL", "VENANCIO AIRES", "RIO PARDO", "SINIMBU", "VERA CRUZ",
  "VALE DO SOL", "HERVEIRAS", "GRAMADO XAVIER", "BOQUEIRAO DO LEAO", "MARQUES DE SOUZA",
  "SANTA CLARA DO SUL", "VALE VERDE", "GENERAL CAMARA", "PASSO DO SOBRADO", "CACHOEIRA DO SUL",
  "LAJEADO", "SOBRADINHO", "NOVO CABRAIS", "CERRO BRANCO", "PARAISO DO SUL", "AGUDO",
  "MATO LEITAO", "CRUZEIRO DO SUL", "PROGRESSO", "BARROS CASSAL", "TAQUARI", "ESTRELA",
];

export type EstacaoCemaden = {
  id: number;
  nome: string;
  cidade: string;
  lat: number;
  lon: number;
  ultimoValor: string; // "dd/mm/aa hh:mm" como vem da lista
};

export type SerieCemaden = { estacao: EstacaoCemaden; pontos: Ponto[] };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

type ItemLista = {
  idestacao: number;
  cidade: string;
  nomeestacao: string;
  datahoraUltimovalor: string;
  tipoestacao: number;
};

type Horario = {
  horarios: string[];
  datas: string[];
  acumulados: (number | string | null)[][];
  estacao?: { idEstacao?: number; nome?: string; latitude?: number; longitude?: number; idMunicipio?: { cidade?: string } };
};

export async function listarEstacoesCemadenRegiao(): Promise<EstacaoCemaden[]> {
  const lista = await buscarJson<ItemLista[]>(URL_LISTA, 3600, 30_000);
  const daRegiao = lista.filter(
    (x) => x.tipoestacao === 1 && MUNICIPIOS_REGIAO.includes(semAcento(x.cidade)),
  );
  // A lista não traz coordenadas: busca 1h de série de cada uma (cache de 1 dia).
  const comCoord = await mapLimitado(daRegiao, 6, async (x) => {
    try {
      const h = await buscarJson<Horario>(`${URL_HORARIO}/${x.idestacao}/1`, 86400);
      const lat = h.estacao?.latitude;
      const lon = h.estacao?.longitude;
      if (typeof lat !== "number" || typeof lon !== "number") return null;
      return {
        id: x.idestacao,
        nome: h.estacao?.nome ?? x.nomeestacao,
        cidade: x.cidade,
        lat,
        lon,
        ultimoValor: x.datahoraUltimovalor,
      } satisfies EstacaoCemaden;
    } catch {
      return null;
    }
  });
  return comCoord.filter((x): x is EstacaoCemaden => x !== null);
}

/** Achata a matriz data x hora em série horária. Dentro do dia, null = hora SEM DADO (não é 0). */
export function interpretarHorario(dados: Horario): Ponto[] {
  const { horarios, datas, acumulados: matriz } = dados;
  if (!Array.isArray(horarios) || !horarios.length || !Array.isArray(datas) || !datas.length || !Array.isArray(matriz))
    throw new Error("estrutura inesperada (faltam horarios/datas/acumulados)");
  if (matriz.length !== datas.length || matriz.some((l) => !Array.isArray(l) || l.length !== horarios.length))
    throw new Error("matriz de acumulados com tamanho incompatível");

  const [d0, m0, a0] = datas[0].split("/").map(Number);
  let dia = Date.UTC(a0, m0 - 1, d0);
  const chave = (t: number) => {
    const x = new Date(t);
    return `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}/${x.getUTCFullYear()}`;
  };
  const linhaDe = new Map(datas.map((d, i) => [d, i]));
  const pontos: Ponto[] = [];
  let hAnt: number | null = null;
  horarios.forEach((rotulo, i) => {
    const h = parseInt(String(rotulo), 10);
    if (hAnt !== null) {
      if (h !== (hAnt + 1) % 24) throw new Error("horários não são consecutivos");
      if (h === 0) dia += 24 * HORA;
    }
    hAnt = h;
    const t = dia + h * HORA;
    const lin = linhaDe.get(chave(dia));
    pontos.push({ t, v: lin === undefined ? null : paraMm(matriz[lin][i]) });
  });
  if (chave(dia) !== datas[datas.length - 1]) throw new Error("datas e horários não batem");
  return pontos;
}

export async function serieCemaden(est: EstacaoCemaden, horas = 720): Promise<SerieCemaden> {
  const dados = await buscarJson<Horario>(`${URL_HORARIO}/${est.id}/${horas}`, 600, 30_000);
  return { estacao: est, pontos: interpretarHorario(dados) };
}
