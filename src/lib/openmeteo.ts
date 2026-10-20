/**
 * Open-Meteo (modelo/reanálise em grade, não é pluviômetro). Serve como 3ª opinião
 * onde não há CEMADEN perto. Precipitação horária = soma da hora ANTERIOR ao rótulo.
 */
import { HORA, Ponto, buscarJson } from "./util";

type Resp = { hourly?: { time: string[]; precipitation: (number | null)[] } };

export async function serieOpenMeteo(lat: number, lon: number): Promise<Ponto[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&hourly=precipitation&past_days=31&forecast_days=1&timezone=GMT`;
  const d = await buscarJson<Resp>(url, 1800);
  if (!d.hourly) throw new Error("resposta sem 'hourly'");
  // Descarta horas futuras (previsão): só hora já encerrada.
  const limite = Math.floor(Date.now() / HORA) * HORA;
  return d.hourly.time
    .map((iso, i) => ({ t: Date.parse(iso + ":00Z"), v: d.hourly!.precipitation[i] ?? null }))
    .filter((p) => p.t <= limite);
}
