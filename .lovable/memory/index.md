# Project Memory

## Core
Light mode optimized for high legibility (darker text, defined borders). Global theme toggle everywhere.
Financial data linked to empresa_id. New file imports replace previous records of the same type.
Edge Functions: auth validation via `supabase.auth.getUser()`; frontend sends Bearer JWT and apikey header.
Users cannot alter their own `master_id` in profiles table (RLS policy).
Profit bounded to >= 0 for ROE/ROA/Margem Líquida calculations.
Default theme is Light Mode (defaultTheme="light").

## Memories
- [Accounting Classification](mem://architecture/accounting-classification-system) — AI + cache engine with section anchors and structural flags (isCMV)
- [Export Constraints](mem://architecture/export-rendering-constraints) — PptxGenJS needs Base64 images; html2pdf.js >=0.14.0 requires image: {type: 'jpeg'}
- [Edge Auth Constraints](mem://architecture/edge-function-auth-constraint) — JWT/apikey requirements for Edge Functions
- [Company Registration](mem://constraints/company-registration-fields) — Required fields: Nome, CNPJ, Contexto for AI sector analysis
- [Security RLS Policies](mem://constraints/security-rls-policies) — RLS policy prohibiting users from altering their master_id
- [Dashboard Indicators](mem://features/financial-dashboard-indicators) — Drill-downs, REDUTORA badges, synthetic accounts labels, calculation fallbacks
- [Multi-File Upload](mem://features/multi-file-upload-identification) — Max 6 files, AI identification of report type (DRE, BP, etc.) from headers
- [Scenario Simulator](mem://features/financial-scenario-simulator) — Chat restricted to financial topics, uses company metadata/account context
- [AI Presentation](mem://features/ai-executive-presentation) — CNAE-aware executive presentations, Recharts, PDF/PPTX export
- [Trial Balance Analysis](mem://features/trial-balance-analysis) — 4-column Balancetes processing, extracts dynamic 'Saldo Atual'
- [Branded Reports](mem://features/branded-reports-export) — PDF/PPTX inherit White Label visual identity from contractor
- [Comparative Trial Balance](mem://features/trial-balance-comparative-analysis) — Vertical/Horizontal analysis, highlights > 5% trends
- [PDF Extraction](mem://features/pdf-accounting-extraction) — Hybrid text/OCR extraction + AI table reconstruction for PDFs
- [Advanced Trial Balance Metrics](mem://features/advanced-trial-balance-metrics) — Efficiency metrics (PMR, PMP), AI group isolation, horizontal bar charts
- [Showcase Page Functionality](mem://features/showcase-page-functionality) — /showcase mirrors /resultado using structured static data
- [Faturamento Analysis](mem://features/faturamento-analysis) — Monthly billing report import + 6-block analysis (indicators, trends, consistency, composition, projections, rankings)
- [DRE Boundaries](mem://parsing/dre-section-boundaries) — Rigid parsing boundaries for DRE sections (Receita Bruta, CMV, Resultado)
- [Robust Normalization](mem://parsing/robust-normalization) — Uses XLSX.utils.sheet_to_json to normalize legacy XLS
- [Synthetic Detection](mem://parsing/synthetic-account-detection) — Multi-pass sum-matching to find hierarchies in XLSX
- [Contra Accounts Handling](mem://parsing/contra-account-handling) — Redutoras subtracted from totals, shown in parentheses with REDUTORA badge
- [DRE Classification Rules](mem://parsing/dre-classification-rules) — Strict AI rules: isCMV priority, labor accounts, 'Resultado' accounts, explicit taxes
- [Financial Net Loss](mem://logic/financial-calculations-net-loss) — Profit bounded to >= 0 for profitability indicators
- [Company Data Model](mem://data-model/company-data-association) — Financial data linked to empresa_id, replaces previous on import
- [User Hierarchy](mem://auth/user-hierarchy-and-white-labeling) — Master manages branding/staff; cascaded deactivation; data isolated by Master
- [RBAC Rules](mem://auth/role-based-access-control) — FUNCIONARIO can manage clients/imports, cannot manage branding/users
- [Branding Extended Fields](mem://data-model/branding-extended-fields) — master_branding fields organization (Company + Responsável)
- [Subscription Plans](mem://monetization/subscription-plans) — Stripe ProCont plans, auth required for checkout
- [PPTX Design](mem://style/pptx-presentation-design) — Widescreen 16:9, styled cards, Segoe UI 11-14, 3D cylindrical charts
