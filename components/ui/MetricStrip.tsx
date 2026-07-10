/**
 * MetricStrip (Graphite COMPONENT-SPEC): un singur container cu valori
 * aliniate, separate de hairlines — NU carduri de statistici separate.
 */
export interface Metric {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}

export function MetricStrip({ metrics }: { metrics: Metric[] }) {
  if (metrics.length === 0) return null;
  return (
    <div
      className="grid rounded-[12px] border border-hairline"
      style={{
        background: "rgba(255,255,255,.02)",
        gridTemplateColumns: `repeat(${metrics.length}, 1fr)`,
      }}
    >
      {metrics.map((metric, i) => (
        <div
          key={metric.label}
          className={`px-[18px] py-3.5 ${i > 0 ? "border-l border-hairline" : ""}`}
        >
          <p className="eyebrow">{metric.label}</p>
          <p
            className={`mt-1 font-display text-[18px] font-semibold leading-tight text-primary ${metric.valueClass ?? ""}`}
          >
            {metric.value}
          </p>
          {metric.sub && <p className="mt-0.5 text-[10.5px] text-tertiary">{metric.sub}</p>}
        </div>
      ))}
    </div>
  );
}
