"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ResultsSummary } from "@/components/results-summary";
import { GainsTable } from "@/components/gains-table";
import { IncomeTable } from "@/components/income-table";
import { HoldingsTable } from "@/components/holdings-table";
import { ErrorDisplay } from "@/components/error-display";

interface TaxReportData {
  taxYear: number;
  costBasisMethod: string;
  disposals: Array<{
    asset: string;
    disposalDate: string;
    disposalType: string;
    proceeds: number;
    costBasis: number;
    gainOrLoss: number;
    isLongTerm: boolean;
    holdingDays: number;
    acquisitionDate: string;
    lotId: string;
  }>;
  incomeEvents: Array<{
    date: string;
    type: string;
    asset: string;
    amount: number;
    fairMarketValueUsd: number;
    wallet: string;
  }>;
  remainingLots: Array<{
    id: string;
    asset: string;
    amount: number;
    originalAmount: number;
    costBasisPerUnit: number;
    acquisitionDate: string;
    acquisitionType: string;
    wallet: string;
  }>;
  form8949Rows: Array<{
    description: string;
    dateAcquired: string;
    dateSold: string;
    proceeds: number;
    costBasis: number;
    gainOrLoss: number;
    isLongTerm: boolean;
    holdingDays: number;
  }>;
  scheduleDSummary: {
    shortTermGains: number;
    shortTermLosses: number;
    longTermGains: number;
    longTermLosses: number;
    netShortTerm: number;
    netLongTerm: number;
    totalNetGainOrLoss: number;
  };
  errors: Array<{ row: number; field: string; message: string }>;
  warnings: Array<{ row: number; field: string; message: string }>;
  detectedFormat?: "native" | "cointracker" | "unknown";
}

function exportCsv(rows: TaxReportData["form8949Rows"]) {
  const header =
    "Description,Date Acquired,Date Sold,Proceeds,Cost Basis,Gain or Loss,Term,Days Held";
  const lines = rows.map((r) =>
    [
      r.description,
      new Date(r.dateAcquired).toLocaleDateString("en-US"),
      new Date(r.dateSold).toLocaleDateString("en-US"),
      r.proceeds.toFixed(2),
      r.costBasis.toFixed(2),
      r.gainOrLoss.toFixed(2),
      r.isLongTerm ? "Long-term" : "Short-term",
      r.holdingDays,
    ].join(","),
  );

  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `form-8949-export.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ResultsPage() {
  const router = useRouter();
  const [report, setReport] = useState<TaxReportData | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("taxReport");
    if (!stored) {
      router.push("/");
      return;
    }
    try {
      setReport(JSON.parse(stored));
    } catch {
      router.push("/");
    }
  }, [router]);

  if (!report) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  const totalIncome = report.incomeEvents.reduce(
    (sum, e) => sum + e.fairMarketValueUsd,
    0,
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Format badge */}
      {report.detectedFormat === "cointracker" && (
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            Imported from CoinTracker
          </span>
        </div>
      )}

      {/* Errors & Warnings */}
      <ErrorDisplay
        errors={report.errors.map((e) => `Row ${e.row}: ${e.message}`)}
        warnings={report.warnings.map((w) => `Row ${w.row}: ${w.message}`)}
      />

      {/* Summary Cards */}
      <ResultsSummary
        scheduleD={report.scheduleDSummary}
        totalIncome={totalIncome}
        taxYear={report.taxYear}
        method={report.costBasisMethod}
      />

      {/* Form 8949 Table */}
      <div className="space-y-2">
        <GainsTable rows={report.form8949Rows} />
        {report.form8949Rows.length > 0 && (
          <div className="flex justify-end">
            <button
              onClick={() => exportCsv(report.form8949Rows)}
              className="text-xs text-accent hover:text-accent-hover transition-colors underline underline-offset-2"
            >
              Export Form 8949 as CSV
            </button>
          </div>
        )}
      </div>

      {/* Income Table */}
      <IncomeTable events={report.incomeEvents} />

      {/* Holdings Table */}
      <HoldingsTable lots={report.remainingLots} />

      {/* Back button */}
      <div className="flex justify-center pt-4">
        <button
          onClick={() => router.push("/")}
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          &larr; Upload another CSV
        </button>
      </div>
    </div>
  );
}
