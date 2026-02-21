"use client";

interface SummaryCardProps {
  label: string;
  value: string;
  subtext?: string;
  variant?: "default" | "gain" | "loss" | "neutral";
}

function SummaryCard({
  label,
  value,
  subtext,
  variant = "default",
}: SummaryCardProps) {
  const colorMap = {
    default: "text-foreground",
    gain: "text-gain",
    loss: "text-loss",
    neutral: "text-muted",
  };

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 space-y-1">
      <p className="text-xs font-medium text-muted uppercase tracking-wider">
        {label}
      </p>
      <p className={`text-2xl font-bold font-mono ${colorMap[variant]}`}>
        {value}
      </p>
      {subtext && <p className="text-xs text-muted">{subtext}</p>}
    </div>
  );
}

interface ScheduleDData {
  shortTermGains: number;
  shortTermLosses: number;
  longTermGains: number;
  longTermLosses: number;
  netShortTerm: number;
  netLongTerm: number;
  totalNetGainOrLoss: number;
}

interface ResultsSummaryProps {
  scheduleD: ScheduleDData;
  totalIncome: number;
  taxYear: number;
  method: string;
}

function formatUsd(n: number): string {
  const abs = Math.abs(n);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(abs);
  return n < 0 ? `-${formatted}` : formatted;
}

export function ResultsSummary({
  scheduleD,
  totalIncome,
  taxYear,
  method,
}: ResultsSummaryProps) {
  const netTotal = scheduleD.totalNetGainOrLoss;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">
          {taxYear} Tax Summary
        </h2>
        <span className="text-xs text-muted font-mono bg-card px-2 py-1 rounded border border-card-border">
          {method}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Net Short-Term"
          value={formatUsd(scheduleD.netShortTerm)}
          variant={scheduleD.netShortTerm >= 0 ? "gain" : "loss"}
          subtext={`Gains: ${formatUsd(scheduleD.shortTermGains)} / Losses: ${formatUsd(scheduleD.shortTermLosses)}`}
        />
        <SummaryCard
          label="Net Long-Term"
          value={formatUsd(scheduleD.netLongTerm)}
          variant={scheduleD.netLongTerm >= 0 ? "gain" : "loss"}
          subtext={`Gains: ${formatUsd(scheduleD.longTermGains)} / Losses: ${formatUsd(scheduleD.longTermLosses)}`}
        />
        <SummaryCard
          label="Ordinary Income"
          value={formatUsd(totalIncome)}
          variant="neutral"
          subtext="Mining, staking, airdrops"
        />
        <SummaryCard
          label="Total Net Gain/Loss"
          value={formatUsd(netTotal)}
          variant={netTotal > 0 ? "gain" : netTotal < 0 ? "loss" : "neutral"}
          subtext="Capital gains only"
        />
      </div>
    </div>
  );
}
