# TourApp Faza 7 — Accounting: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** §10 Faza 7: migrația §3.11, `computeSettlement()` pur cu ordinea EXACTĂ din A.4, UI settlement (tickets cu kills/scans, expenses pe 3 etape vizual, formula fields simple, copy from another event, non-settlement Line Items), CSV exports, Settlement PDF. Vizibil DOAR admin+accounting [C].

**DoD (blueprint):** un settlement 85/15 cu taxe și withholding dă totalul corect.

### Task 1: Migration 00012 + RLS + teste
- [x] settlements (toate câmpurile waterfall A.4, currency, deal_type, finalized_at), ticket_sales (label/capacity/comps/kills/scans/sold/gross_price/net_price [C]), expense_stage enum (pre_split|post_split|withholding [C]), settlement_expenses (formula text [C]), non_settlement_items (CATEGORY|DESCRIPTION|INCOME|EXPENSE [C-S])
- [x] RLS: select + write DOAR has_min_permission('accounting') [C §4.2]; edit cere și pro (✔*)
- [x] Teste faza7: managerul NU vede settlements [C]; accounting da; crew nu
- [x] Commit

### Task 2: lib/settlement.ts — computeSettlement() + formule
- [x] Ordinea EXACTĂ A.4: gross − taxes = net; net − totalExpenses = AMOUNT TO POT; overage = split% × max(0, pot − guarantee) [D]; walkout = guarantee + overage [C-S]; amountDue = walkout + reimb + chargebacks − deposit − withholding − cash − ticketBuys − NOS deductions; percentOfCapacity
- [x] `evalExpenseFormula('<n>% of gross|net' | sumă)` [N §6.12]
- [x] Teste: DoD 85/15 cu taxe + withholding; guarantee-only; pot sub guarantee (overage 0); formule
- [x] Commit

### Task 3: UI Accounting (/e/[eventId]/accounting, guard admin|accounting)
- [x] Tabs: Settlement (waterfall vizual în ordinea calculului, câmpuri derivate read-only [A.4]) | Ticket Sales (grid cu kills/scans + totaluri) | Expenses (3 etape vizual distincte [C §6.12] + formula) | Line Items (grid cu TOTAL INCOME/EXPENSE/GRAND TOTAL [C-S])
- [x] Copy From Another Event [C]
- [x] Commit

### Task 4: Exporturi
- [x] CSV: /api/csv/settlement/[eventId] (settlement + line items) [C]
- [x] Settlement PDF: pdf/SettlementPdf.tsx + /api/pdf/settlement/[eventId]
- [x] Commit + verificări verzi
