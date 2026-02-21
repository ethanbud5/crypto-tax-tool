"use client";

interface IncomeEvent {
  date: string;
  type: string;
  asset: string;
  amount: number;
  fairMarketValueUsd: number;
  wallet: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtAmount(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

interface IncomeTableProps {
  events: IncomeEvent[];
}

export function IncomeTable({ events }: IncomeTableProps) {
  if (events.length === 0) return null;

  const totalIncome = events.reduce((sum, e) => sum + e.fairMarketValueUsd, 0);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
        Ordinary Income Events
      </h3>

      <div className="rounded-xl border border-card-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border bg-card">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Asset
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                  FMV (USD)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Wallet
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event, i) => (
                <tr
                  key={i}
                  className="border-b border-card-border/50 hover:bg-card/50 transition-colors"
                >
                  <td className="px-4 py-3">{fmtDate(event.date)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-purple-500/10 text-purple-400">
                      {event.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono font-medium">
                    {event.asset}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {fmtAmount(event.amount)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium">
                    {fmtUsd(event.fairMarketValueUsd)}
                  </td>
                  <td className="px-4 py-3 text-muted">{event.wallet}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-card">
                <td
                  colSpan={4}
                  className="px-4 py-3 text-right text-xs font-medium text-muted uppercase"
                >
                  Total Income
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold">
                  {fmtUsd(totalIncome)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
