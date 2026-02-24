// ─── CSV Import Orchestrator ──────────────────────────────────────────────────
// Thin layer that auto-detects CSV format, normalizes if needed, then delegates
// to the existing parseCsv() function.

import { ParseResult } from "@/engine/types";
import { parseCsv } from "@/engine/csv-parser";
import { detectCsvFormat, CsvFormat } from "@/engine/csv-format-detector";
import { normalizeCoinTracker } from "@/engine/cointracker-normalizer";
import { enrichPrices } from "@/engine/price-lookup";

export interface ImportResult {
  parseResult: ParseResult;
  detectedFormat: CsvFormat;
  normalizationWarnings: string[];
}

export async function importCsv(csvContent: string): Promise<ImportResult> {
  const detectedFormat = detectCsvFormat(csvContent);
  let normalizationWarnings: string[] = [];
  let csvToParse = csvContent;

  if (detectedFormat === "cointracker") {
    const normalized = normalizeCoinTracker(csvContent);
    csvToParse = normalized.csvContent;
    normalizationWarnings = normalized.warnings;

    // Auto-fetch missing USD prices from CryptoCompare
    const enrichment = await enrichPrices(csvToParse);
    csvToParse = enrichment.csvContent;
    normalizationWarnings = [...normalizationWarnings, ...enrichment.warnings];
  }

  // For "unknown" format, we still attempt a native parse — parseCsv will
  // report errors if the columns don't match.
  const parseResult = parseCsv(csvToParse);

  // Merge normalization warnings into parseResult.warnings so they flow
  // through to the report alongside parser warnings.
  for (const msg of normalizationWarnings) {
    parseResult.warnings.push({ row: 0, field: "", message: msg });
  }

  return { parseResult, detectedFormat, normalizationWarnings };
}
