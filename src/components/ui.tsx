import type { Comparacao } from "@/lib/audit";
import type { Status } from "@/lib/auditar";
import type { Nivel } from "@/lib/util";

const COR_STATUS: Record<Status, string> = {
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  suspeita: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  falha: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};
const TXT_STATUS: Record<Status, string> = { ok: "Dentro do padrão", suspeita: "Suspeita", falha: "Falhando" };

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${COR_STATUS[status]}`}>
      {TXT_STATUS[status]}
    </span>
  );
}

const COR_NIVEL: Record<Nivel, string> = {
  ERRO: "border-red-500 bg-red-50 dark:bg-red-950/30",
  AVISO: "border-amber-500 bg-amber-50 dark:bg-amber-950/30",
  INFO: "border-sky-400 bg-sky-50 dark:bg-sky-950/30",
};

export function ListaAchados({ achados }: { achados: { nivel: Nivel; msg: string }[] }) {
  if (!achados.length) return <p className="text-sm text-neutral-500">Nenhum achado.</p>;
  return (
    <ul className="space-y-2">
      {achados.map((a, i) => (
        <li key={i} className={`border-l-4 px-3 py-2 text-sm rounded-r ${COR_NIVEL[a.nivel]}`}>
          <span className="font-mono text-xs font-bold mr-2">{a.nivel}</span>
          {a.msg}
        </li>
      ))}
    </ul>
  );
}

const COR_ESTADO: Record<Comparacao["estado"], string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  diverge: "text-red-700 dark:text-red-400 font-semibold",
  "sem-cobertura": "text-neutral-400",
  "sem-unisc": "text-neutral-400",
};
const TXT_ESTADO: Record<Comparacao["estado"], string> = {
  ok: "concorda",
  diverge: "diverge",
  "sem-cobertura": "pouco dado",
  "sem-unisc": "UNISC n/d",
};

export function TabelaComparacao({ comparacoes }: { comparacoes: Comparacao[] }) {
  if (!comparacoes.length) return <p className="text-sm text-neutral-500">Sem comparação.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
          <th className="py-1.5 font-medium">Período</th>
          <th className="py-1.5 font-medium text-right">UNISC</th>
          <th className="py-1.5 font-medium text-right">Referência</th>
          <th className="py-1.5 font-medium text-right">Δ</th>
          <th className="py-1.5 font-medium text-right">Horas</th>
          <th className="py-1.5 font-medium text-right">Estado</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {comparacoes.map((c) => {
          const parcial = c.ref.validos < c.ref.esperados ? "≥" : "";
          const delta = c.unisc === null ? null : c.unisc - c.ref.soma;
          return (
            <tr key={c.periodo} className="border-b border-neutral-100 dark:border-neutral-900">
              <td className="py-1.5">{c.periodo}</td>
              <td className="py-1.5 text-right">{c.unisc?.toFixed(1) ?? "n/d"}</td>
              <td className="py-1.5 text-right">
                {parcial}
                {c.ref.soma.toFixed(1)}
              </td>
              <td className="py-1.5 text-right">
                {delta === null ? "–" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
                <span className="text-neutral-400 text-xs"> ±{c.tolerancia.toFixed(1)}</span>
              </td>
              <td className="py-1.5 text-right text-neutral-500">
                {c.ref.validos}/{c.ref.esperados}
              </td>
              <td className={`py-1.5 text-right ${COR_ESTADO[c.estado]}`}>{TXT_ESTADO[c.estado]}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const CORES_SERIE = ["#2563eb", "#0d9488", "#a855f7"];

/** Barras diárias agrupadas (SVG puro). */
export function GraficoDiario({ series }: { series: { nome: string; dias: { dia: number; soma: number; cobertura: number }[] }[] }) {
  if (!series.length || !series[0].dias.length) return null;
  const n = series[0].dias.length;
  const max = Math.max(1, ...series.flatMap((s) => s.dias.map((d) => d.soma)));
  const W = 900, H = 220, pad = { l: 36, r: 8, t: 10, b: 28 };
  const gw = (W - pad.l - pad.r) / n;
  const bw = Math.max(1, (gw - 3) / series.length);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, max / 2, max];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Chuva diária por fonte">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-neutral-200 dark:stroke-neutral-800" />
            <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" className="fill-neutral-500 text-[10px]">
              {t.toFixed(0)}
            </text>
          </g>
        ))}
        {series[0].dias.map((d, i) => {
          const x0 = pad.l + i * gw + 1.5;
          const dt = new Date(d.dia - 3 * 3_600_000);
          return (
            <g key={d.dia}>
              {series.map((s, k) => {
                const p = s.dias[i];
                return (
                  <rect
                    key={k}
                    x={x0 + k * bw}
                    y={y(p.soma)}
                    width={bw}
                    height={Math.max(0, H - pad.b - y(p.soma))}
                    fill={CORES_SERIE[k % CORES_SERIE.length]}
                    opacity={p.cobertura < 0.85 ? 0.35 : 1}
                  >
                    <title>{`${s.nome}: ${p.soma.toFixed(1)} mm (${Math.round(p.cobertura * 100)}% das horas)`}</title>
                  </rect>
                );
              })}
              {i % 3 === 0 && (
                <text x={x0 + gw / 2} y={H - 10} textAnchor="middle" className="fill-neutral-500 text-[10px]">
                  {`${dt.getUTCDate()}/${dt.getUTCMonth() + 1}`}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-4 text-xs mt-1">
        {series.map((s, k) => (
          <span key={s.nome} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: CORES_SERIE[k % CORES_SERIE.length] }} />
            {s.nome}
          </span>
        ))}
        <span className="text-neutral-500">barra clara = dia com &lt;85% das horas</span>
      </div>
    </div>
  );
}
