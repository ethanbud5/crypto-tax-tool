import { NextRequest, NextResponse } from "next/server";
import { importCsv } from "@/engine/csv-import";
import { calculateTaxes } from "@/engine/tax-calculator";
import { generateReport } from "@/engine/report-generator";
import { CostBasisMethod } from "@/engine/types";
import Decimal from "decimal.js";

// Serialize Decimal values to numbers for JSON transport
function serializeDecimals(obj: unknown): unknown {
  if (obj instanceof Decimal) return obj.toNumber();
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(serializeDecimals);
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeDecimals(value);
    }
    return result;
  }
  return obj;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const taxYear = Number(formData.get("taxYear"));
    const methodStr = formData.get("costBasisMethod") as string;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!taxYear || isNaN(taxYear)) {
      return NextResponse.json(
        { error: "Invalid tax year" },
        { status: 400 },
      );
    }

    const method =
      (Object.values(CostBasisMethod) as string[]).includes(methodStr)
        ? (methodStr as CostBasisMethod)
        : CostBasisMethod.FIFO;

    const csvContent = await file.text();
    const { parseResult, detectedFormat } = await importCsv(csvContent);

    // If there are critical parsing errors and no transactions, fail
    if (parseResult.transactions.length === 0 && parseResult.errors.length > 0) {
      return NextResponse.json(
        {
          error: "CSV parsing failed",
          errors: parseResult.errors.map((e) => e.message),
          warnings: parseResult.warnings.map((w) => w.message),
        },
        { status: 400 },
      );
    }

    const calcResult = calculateTaxes(parseResult.transactions, method);

    const report = generateReport(
      calcResult.disposals,
      calcResult.incomeEvents,
      calcResult.remainingLots,
      taxYear,
      method,
      [...parseResult.errors, ...calcResult.errors],
      [...parseResult.warnings, ...calcResult.warnings],
    );

    return NextResponse.json({
      ...(serializeDecimals(report) as Record<string, unknown>),
      detectedFormat,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
