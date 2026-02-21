"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CsvUpload } from "@/components/csv-upload";
import { ErrorDisplay } from "@/components/error-display";

const COST_BASIS_METHODS = [
  {
    value: "FIFO",
    label: "FIFO (First In, First Out)",
    description: "IRS default — sells your oldest lots first",
  },
  {
    value: "LIFO",
    label: "LIFO (Last In, First Out)",
    description: "Sells your newest lots first",
  },
  {
    value: "HIFO",
    label: "HIFO (Highest In, First Out)",
    description: "Sells highest-cost lots first — minimizes taxable gains",
  },
];

export default function Home() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [taxYear, setTaxYear] = useState(new Date().getFullYear() - 1);
  const [method, setMethod] = useState("FIFO");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setErrors([]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("taxYear", String(taxYear));
      formData.append("costBasisMethod", method);

      const res = await fetch("/api/calculate", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setErrors([data.error || "Calculation failed"]);
        return;
      }

      // Store results in sessionStorage and navigate
      sessionStorage.setItem("taxReport", JSON.stringify(data));
      router.push("/results");
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setLoading(false);
    }
  }, [file, taxYear, method, router]);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Hero */}
      <div className="text-center space-y-3 pt-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Crypto Tax Calculator
        </h1>
        <p className="text-muted max-w-lg mx-auto">
          Upload your transaction CSV to generate IRS-compliant Form 8949 line
          items and Schedule D summaries. Supports FIFO, LIFO, and HIFO cost
          basis methods.
        </p>
      </div>

      {/* Sample CSV download */}
      <div className="flex justify-center">
        <a
          href="/sample.csv"
          download
          className="text-sm text-accent hover:text-accent-hover transition-colors underline underline-offset-4"
        >
          Download sample CSV template
        </a>
      </div>

      {/* Upload area */}
      <CsvUpload file={file} onFileChange={setFile} />
      <p className="text-xs text-muted text-center -mt-4">
        Supports native format and CoinTracker CSV exports
      </p>

      {/* Configuration */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Tax Year */}
        <div className="space-y-2">
          <label
            htmlFor="taxYear"
            className="block text-sm font-medium text-muted"
          >
            Tax Year
          </label>
          <select
            id="taxYear"
            value={taxYear}
            onChange={(e) => setTaxYear(Number(e.target.value))}
            className="w-full rounded-lg border border-card-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* Cost Basis Method */}
        <div className="space-y-2">
          <label
            htmlFor="method"
            className="block text-sm font-medium text-muted"
          >
            Cost Basis Method
          </label>
          <select
            id="method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full rounded-lg border border-card-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
          >
            {COST_BASIS_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">
            {COST_BASIS_METHODS.find((m) => m.value === method)?.description}
          </p>
        </div>
      </div>

      {/* Errors */}
      {errors.length > 0 && <ErrorDisplay errors={errors} />}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!file || loading}
        className="w-full rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 px-4 transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-background"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Calculating...
          </span>
        ) : (
          "Calculate Taxes"
        )}
      </button>

      {/* Disclaimer */}
      <p className="text-xs text-muted text-center pb-8">
        This tool is for informational purposes only and does not constitute tax
        advice. Consult a tax professional for your specific situation.
      </p>
    </div>
  );
}
