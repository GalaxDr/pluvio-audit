import Link from "next/link";
import { notFound } from "next/navigation";
import { GraficoDiario, ListaAchados, StatusBadge, TabelaComparacao } from "@/components/ui";
import { auditarEstacao, carregarBase } from "@/lib/auditar";
import { fmtBrt, mm } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function PaginaEstacao({ params }: { params: Promise<{ cod: string }> }) {
  const { cod } = await params;
  const { unisc, cemaden } = await carregarBase();
  const est = unisc.find((e) => e.cod === Number(cod));
  if (!est) notFound();
  const a = await auditarEstacao(est, cemaden, { diario: true });
  const l = a.leitura;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">← todas as estações</Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-semibold">{est.nome}</h1>
          <StatusBadge status={a.status} />
        </div>
        <p className="text-sm text-neutral-500">
          UNISC cód. {est.cod} · {est.lat.toFixed(4)}, {est.lon.toFixed(4)} · leitura {fmtBrt(l?.instante ?? null, true)}
          {l?.temperatura && ` · ${l.temperatura}`}
          {l?.umidade && ` · ${l.umidade}`}
        </p>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          ["Hoje", l?.diaMm],
          ["24h", l?.h24Mm],
          ["7 dias", l?.d7Mm],
          ["Mês", l?.mesMm],
          ["30 dias", l?.d30Mm],
        ].map(([rot, v]) => (
          <div key={rot as string} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
            <div className="text-xs text-neutral-500">{rot}</div>
            <div className="text-xl font-semibold tabular-nums">{mm(v as number | null)}</div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="font-semibold mb-2">Achados</h2>
        <ListaAchados achados={a.achados} />
      </section>

      <section>
        <h2 className="font-semibold mb-2">Chuva diária das referências (30 dias, horário de Brasília)</h2>
        <p className="text-xs text-neutral-500 mb-2">A UNISC só expõe acumulados, não série; por isso ela aparece nas tabelas abaixo, não no gráfico.</p>
        <GraficoDiario series={a.diario} />
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        {a.referencias.map((r) => (
          <div key={r.nome} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
            <h3 className="font-medium">{r.nome}</h3>
            <p className="text-xs text-neutral-500 mb-3">
              {r.tipo === "estacao" ? `Pluviômetro a ${r.distanciaKm?.toFixed(1)} km` : "Modelo em grade (sem pluviômetro)"}
              {r.idCemaden && (
                <>
                  {" · "}
                  <a
                    className="hover:underline"
                    href={`https://mapservices.cemaden.gov.br/MapaInterativoWS/resources/horario/${r.idCemaden}/182`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    JSON bruto
                  </a>
                </>
              )}
            </p>
            {r.erro ? <p className="text-sm text-red-600">{r.erro}</p> : <TabelaComparacao comparacoes={r.comparacoes} />}
          </div>
        ))}
      </section>

      <section>
        <h2 className="font-semibold mb-2">Estações CEMADEN em até 25 km</h2>
        {a.vizinhosCemaden.length ? (
          <ul className="text-sm space-y-1">
            {a.vizinhosCemaden.map((c) => (
              <li key={c.id} className="tabular-nums">
                {c.distanciaKm.toFixed(1)} km — {c.cidade} · {c.nome} (id {c.id}) · último valor {c.ultimoValor}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">Nenhuma.</p>
        )}
      </section>
    </div>
  );
}
