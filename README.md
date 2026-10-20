# Auditoria Pluviométrica

Compara as estações UNISC (Elysios) com pluviômetros CEMADEN próximos e com o modelo Open-Meteo,
para achar estação parada, travada ou fora do padrão.

```bash
npm install
npm run dev   # http://localhost:3000
```

## Páginas

- `/` — todas as estações UNISC, com status (Falhando / Suspeita / Dentro do padrão).
- `/estacao/[cod]` — detalhe: acumulados, achados, gráfico diário das referências, tabelas de comparação.
- `/api/auditoria` e `/api/auditoria?cod=13` — mesmo resultado em JSON.

## Fontes

| Fonte | Endpoint | Obs. |
|---|---|---|
| UNISC | `estacaobackend.unisc.br/.../resumoUltimaLeitura/codEstacao/{cod}` | só acumulados (dia, 24h, 7d, mês, 30d) |
| CEMADEN lista | `resources.cemaden.gov.br/graficos/interativo/getJson2.php?uf=RS` | não documentado, sem coordenadas |
| CEMADEN série | `mapservices.cemaden.gov.br/MapaInterativoWS/resources/horario/{id}/{horas}` | não documentado; rótulos em UTC |
| Open-Meteo | `api.open-meteo.com/v1/forecast?...&past_days=31` | modelo em grade, não pluviômetro |

## Regras (`src/lib/audit.ts`)

- **ERRO**: leitura UNISC velha (>60 min), acumulados contraditórios (dia > 24h, 7d > 30d…),
  campo ausente, ou pluviômetro travado (30d ≈ 0 com modelo ≥ 50 mm; ou 7d ≈ 0 com vizinhos ≥ 10 mm).
- **AVISO**: UNISC diverge da **maioria** das fontes, todas do mesmo lado, com pelo menos um pluviômetro.
  Tolerância: estação ±max(piso, 30%), modelo ±max(2×piso, 60%); piso 2 mm (hoje/24h), 5 mm (7d), 10 mm (mês/30d).
- Estação CEMADEN com menos de 50% das horas, ou "morta" (30d < 5% do modelo), é descartada como referência.
- Usa as 2 estações CEMADEN boas mais próximas num raio de 25 km.

Coerência não prova exatidão. Ajuste os limites em `CFG` e os municípios em `MUNICIPIOS_REGIAO` (`src/lib/cemaden.ts`).
