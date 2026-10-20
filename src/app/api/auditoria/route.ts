import { NextResponse } from "next/server";
import { auditarEstacao, auditarTodas, carregarBase } from "@/lib/auditar";

export const dynamic = "force-dynamic";

/** GET /api/auditoria            -> todas as estações
 *  GET /api/auditoria?cod=13     -> uma estação, com série diária */
export async function GET(req: Request) {
  const cod = new URL(req.url).searchParams.get("cod");
  if (!cod) return NextResponse.json(await auditarTodas());
  const { unisc, cemaden } = await carregarBase();
  const est = unisc.find((e) => e.cod === Number(cod));
  if (!est) return NextResponse.json({ erro: "estação não encontrada" }, { status: 404 });
  return NextResponse.json(await auditarEstacao(est, cemaden, { diario: true }));
}
