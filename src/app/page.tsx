import Link from "next/link";
import { StatusBadge } from "@/components/ui";
import { auditarTodas, type Auditoria, type Referencia } from "@/lib/auditar";
import type { Periodo } from "@/lib/audit";
import { fmtBrt } from "@/lib/util";

export const dynamic = "force-dynamic";

function valorRef(r: Referencia | undefined, p: Periodo) {
  const c = r?.comparacoes.find((x) => x.periodo === p);
  if (!c) return <span className="text-neutral-400">–</span>;
  if (c.estado === "sem-cobertura") return <span className="text-neutral-400" title="pouco dado">({c.ref.soma.toFixed(1)})</span>;
  return <span className={c.estado === "diverge" ? "text-red-600 dark:text-red-400 font-semibold" : ""}>{c.ref.soma.toFixed(1)}</span>;
}

function Linha({ a }: { a: Auditoria }) {
  const cem = a.referencias.find((r) => r.tipo === "estacao" && r.comparacoes.length);
  const om = a.referencias.find((r) => r.tipo === "modelo");
  const n = (s: "ERRO" | "AVISO") => a.achados.filter((x) => x.nivel === s).length;
  return (
    <tr className="border-b border-neutral-100 dark:border-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
      <td className="py-2 min-w-[200px]">
        <Link href={`/estacao/${a.estacao.cod}`} className="font-medium hover:underline">
          {a.estacao.nome}
        </Link>
        <div className="text-xs text-neutral-500">
          leitura {fmtBrt(a.leitura?.instante ?? null)}
          {cem && ` · CEMADEN a ${cem.distanciaKm?.toFixed(1)} km`}
        </div>
      </td>
      <td className="py-2 whitespace-nowrap"><StatusBadge status={a.status} /></td>
      <td className="py-2 text-right">{a.leitura?.h24Mm?.toFixed(1) ?? "n/d"}</td>
      <td className="py-2 text-right">{a.leitura?.d7Mm?.toFixed(1) ?? "n/d"}</td>
      <td className="py-2 text-right">{a.leitura?.d30Mm?.toFixed(1) ?? "n/d"}</td>
      <td className="py-2 text-right border-l border-neutral-200 dark:border-neutral-800 pl-2">{valorRef(cem, "7 dias")}</td>
      <td className="py-2 text-right">{valorRef(cem, "30 dias")}</td>
      <td className="py-2 text-right border-l border-neutral-200 dark:border-neutral-800 pl-2">{valorRef(om, "7 dias")}</td>
      <td className="py-2 text-right">{valorRef(om, "30 dias")}</td>
      <td className="py-2 text-right text-xs whitespace-nowrap">
        {n("ERRO") > 0 && <span className="text-red-600 dark:text-red-400">{n("ERRO")} erro </span>}
        {n("AVISO") > 0 && <span className="text-amber-600 dark:text-amber-400">{n("AVISO")} aviso</span>}
      </td>
    </tr>
  );
}

export default async function Home() {
  const auditorias = await auditarTodas();
  const ordem = { falha: 0, suspeita: 1, ok: 2 };
  auditorias.sort((a, b) => ordem[a.status] - ordem[b.status] || a.estacao.nome.localeCompare(b.estacao.nome));
  const conta = (s: Auditoria["status"]) => auditorias.filter((a) => a.status === s).length;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-3 gap-3 max-w-xl">
        {(["falha", "suspeita", "ok"] as const).map((s) => (
          <div key={s} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
            <div className="text-2xl font-semibold tabular-nums">{conta(s)}</div>
            <StatusBadge status={s} />
          </div>
        ))}
      </section>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm tabular-nums [&_td]:px-2 [&_th]:px-2">
          <thead>
            <tr className="text-xs text-neutral-500">
              <th />
              <th />
              <th colSpan={3} className="text-right font-medium pb-1">UNISC (mm)</th>
              <th colSpan={2} className="text-right font-medium pb-1 border-l border-neutral-200 dark:border-neutral-800">CEMADEN mais perto</th>
              <th colSpan={2} className="text-right font-medium pb-1 border-l border-neutral-200 dark:border-neutral-800">Open-Meteo</th>
              <th />
            </tr>
            <tr className="text-left text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
              <th className="py-1.5 font-medium">Estação</th>
              <th className="py-1.5 font-medium">Status</th>
              <th className="py-1.5 font-medium text-right">24h</th>
              <th className="py-1.5 font-medium text-right">7d</th>
              <th className="py-1.5 font-medium text-right">30d</th>
              <th className="py-1.5 font-medium text-right border-l border-neutral-200 dark:border-neutral-800">7d</th>
              <th className="py-1.5 font-medium text-right">30d</th>
              <th className="py-1.5 font-medium text-right border-l border-neutral-200 dark:border-neutral-800">7d</th>
              <th className="py-1.5 font-medium text-right">30d</th>
              <th className="py-1.5 font-medium text-right">Achados</th>
            </tr>
          </thead>
          <tbody>
            {auditorias.map((a) => (
              <Linha key={a.estacao.cod} a={a} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">
        Vermelho = fora da tolerância (estação: ±max(2 mm, 30%); modelo: ±max(5 mm, 50%)). Valor entre parênteses = referência com
        menos de 85% das horas. Gerado {fmtBrt(Date.now())}.
      </p>
    </div>
  );
}
