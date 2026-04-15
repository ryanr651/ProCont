---
name: Faturamento Analysis
description: Monthly billing report (FATURAMENTO) import and 6-block analysis dashboard in /resultado
type: feature
---
- New file type FATURAMENTO recognized during upload (PDF/XLS/CSV with "RELATÓRIO DE FATURAMENTO" header)
- Table `faturamento_entries` stores: mes, ano, saidas, servicos, outros, total per month
- Parser in `src/lib/faturamentoParser.ts` handles BR number format
- Component `src/components/FaturamentoAnalysis.tsx` renders 6 analysis blocks:
  1. Key indicators (max/min month, average, annual total, variation)
  2. Trend analysis (MoM variation, quarterly, semestral comparison)
  3. Consistency (std dev, CV, above/below average)
  4. Revenue composition (donut chart, service evolution)
  5. Projections (annualized, next month, custom target)
  6. Rankings (top 3, bottom 3, full ranking table)
- Section appears after Balancete AV/AH comparative section, conditional on faturamento data existing
