"use client";

import {
  AlertTriangle,
  Fuel,
  Gauge,
  PackageCheck,
  Route,
  Truck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";

import { useAuthStore } from "@/app/store/auth-store";
import {
  DAILY_DELIVERIES,
  DASHBOARD_AS_OF,
  DELIVERY_STATUS,
  DEPOT_PRODUCT_HEAT,
  DISPATCH_HEAT,
  DROP_SCATTER,
  FLEET_RADIAL,
  FORECAST_VS_ACTUAL,
  HEAT_DAYS,
  HEAT_HOURS,
  KPI_CARDS,
  MODULE_PULSE,
  ORDER_ORIGIN,
  ORDER_STATUS,
  PIE_COLORS,
  PIPELINE_FUNNEL,
  PRODUCT_MIX,
  ROUTE_RADAR,
  ROUTE_VOLUME,
  RUNOUT_QUEUE,
  SEGMENT_TREEMAP,
  STOCK_BY_PRODUCT,
  TRANSACTIONS,
} from "@/app/ui/dashboard/dashboard-data";

const KPI_ICONS = [PackageCheck, Fuel, AlertTriangle, Route, Truck, Gauge];

const tooltipStyle = {
  background: "rgb(255 255 255 / 0.96)",
  border: "1px solid color-mix(in srgb, var(--chrome-border) 70%, #e2e8f0)",
  borderRadius: 12,
  fontSize: 12,
};

function ChartCard({
  title,
  caption,
  children,
  className = "",
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`app-surface-card p-4 sm:p-5 ${className}`}>
      <h2 className="text-sm font-semibold text-[var(--sidebar-text)]">{title}</h2>
      <p className="mt-0.5 text-[11px] text-[var(--chrome-muted)]">{caption}</p>
      <div className="mt-3 h-[260px] w-full">{children}</div>
    </section>
  );
}

function heatTone(value: number, max = 100) {
  const t = Math.max(0, Math.min(1, value / max));
  return `color-mix(in srgb, var(--primary) ${Math.round(18 + t * 72)}%, white)`;
}

function statusTone(status: string) {
  const key = status.toLowerCase();
  if (key.includes("delay") || key.includes("critical") || key.includes("disqual")) {
    return "bg-red-50 text-red-700";
  }
  if (key.includes("pending") || key.includes("unassigned") || key.includes("reserved")) {
    return "bg-amber-50 text-amber-800";
  }
  if (key.includes("complete") || key.includes("fulfill") || key.includes("qualif")) {
    return "bg-emerald-50 text-emerald-800";
  }
  return "bg-[color-mix(in_srgb,var(--chrome-from)_55%,white)] text-[var(--sidebar-text)]";
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="space-y-4">
      <section className="app-hero-banner px-5 py-5 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--chrome-muted)]">
          Operations dashboard
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-cormorant)] text-3xl font-bold tracking-tight text-[var(--sidebar-text)]">
          Fuel & gas distribution.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--chrome-muted)]">
          order-to-delivery spine: qualification, ranking, stock reservation,
          routing, PTL loading, telemetry run-out risk, and field proof of delivery. {DASHBOARD_AS_OF}.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        {KPI_CARDS.map((card, index) => {
          const Icon = KPI_ICONS[index] ?? Gauge;
          return (
            <article key={card.key} className="app-surface-card px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--chrome-muted)]">
                  {card.label}
                </p>
                <span className="rounded-lg bg-[color-mix(in_srgb,var(--primary)_16%,white)] p-1.5 text-[var(--primary)]">
                  <Icon size={14} />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--sidebar-text)]">{card.value}</p>
              <p className="mt-1 text-[11px] text-[var(--chrome-muted)]">{card.hint}</p>
              <p className={`mt-1 text-[11px] font-semibold ${card.up ? "text-emerald-700" : "text-red-600"}`}>
                {card.delta}
              </p>
            </article>
          );
        })}
      </div>

      <section className="app-surface-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-[var(--sidebar-text)]">Module pulse · 10 TMS components</h2>
        <p className="mt-0.5 text-[11px] text-[var(--chrome-muted)]">
          Dummy health scores for the SOW modules (master data through mobile PoD).
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {MODULE_PULSE.map((mod) => (
            <div key={mod.id} className="rounded-xl border border-[color:var(--chrome-border)]/70 bg-white/70 px-3 py-2.5">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-[var(--chrome-muted)]">
                <span>{mod.id}</span>
                <span className="text-[var(--sidebar-text)]">{mod.health}%</span>
              </div>
              <p className="mt-1 truncate text-xs font-semibold text-[var(--sidebar-text)]">{mod.name}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--chrome-via)_50%,#e2e8f0)]">
                <span
                  className="block h-full rounded-full bg-[var(--primary)]"
                  style={{ width: `${mod.health}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <ChartCard
          className="xl:col-span-3"
          title="Delivered volume by product (k L)"
          caption="Vertical stacked bars · last 14 days · propane / ULSD / gasoline / heating oil"
        >
          <ResponsiveContainer>
            <BarChart data={DAILY_DELIVERIES} barCategoryGap={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--chrome-border) 65%, transparent)" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} label={{ value: "k litres", angle: -90, position: "insideLeft", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="propane" name="Propane" stackId="a" fill="var(--primary)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="ulsd" name="ULSD" stackId="a" fill="var(--secondary)" />
              <Bar dataKey="gasoline" name="Gasoline" stackId="a" fill="var(--accent)" />
              <Bar dataKey="heating" name="Heating oil" stackId="a" fill="var(--success)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          className="xl:col-span-2"
          title="Product mix today"
          caption="Donut · open demand share by fuel grade"
        >
          <ResponsiveContainer>
            <PieChart>
              <Pie data={PRODUCT_MIX} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2}>
                {PRODUCT_MIX.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${(Number(value) / 1000).toFixed(1)}k L`, "Volume"]} contentStyle={tooltipStyle} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Volume by route"
          caption="Horizontal bars · litres planned on today's corridors"
        >
          <ResponsiveContainer>
            <BarChart data={ROUTE_VOLUME} layout="vertical" margin={{ left: 12, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--chrome-border) 65%, transparent)" />
              <XAxis type="number" tick={{ fontSize: 11 }} label={{ value: "Litres", position: "insideBottom", offset: -2, fontSize: 11 }} />
              <YAxis type="category" dataKey="route" width={110} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="litres" name="Litres" fill="var(--primary)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Order origination mix"
          caption="Pie · how tickets entered the single delivery queue"
        >
          <ResponsiveContainer>
            <PieChart>
              <Pie data={ORDER_ORIGIN} dataKey="value" nameKey="name" outerRadius="80%">
                {ORDER_ORIGIN.map((entry, index) => (
                  <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Forecast vs actual demand (k L)"
          caption="Area + line · telemetry-driven forecast with 3-day projection"
        >
          <ResponsiveContainer>
            <ComposedChart data={FORECAST_VS_ACTUAL}>
              <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--chrome-border) 65%, transparent)" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} label={{ value: "k litres", angle: -90, position: "insideLeft", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Area type="monotone" dataKey="projected" name="Projected" fill="color-mix(in srgb, var(--accent) 28%, white)" stroke="var(--accent)" />
              <Line type="monotone" dataKey="forecast" name="Forecast" stroke="var(--secondary)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="actual" name="Actual" stroke="var(--primary)" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Stock reserved vs available vs dispatched"
          caption="Grouped vertical bars · k L by product at supply points"
        >
          <ResponsiveContainer>
            <BarChart data={STOCK_BY_PRODUCT}>
              <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--chrome-border) 65%, transparent)" />
              <XAxis dataKey="product" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} label={{ value: "k litres", angle: -90, position: "insideLeft", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="reserved" name="Reserved" fill="var(--warning)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="available" name="Available" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="dispatched" name="Dispatched" fill="var(--secondary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Order status" caption="Donut · qualified / pending / disqualified / fulfilled">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={ORDER_STATUS} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="80%">
                {ORDER_STATUS.map((entry, index) => (
                  <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Delivery status" caption="Donut · scheduled / in transit / completed / delayed">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={DELIVERY_STATUS} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="80%">
                {DELIVERY_STATUS.map((entry, index) => (
                  <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Fleet scorecard" caption="Radial bars · utilisation, plan adherence, fill, HOS">
          <ResponsiveContainer>
            <RadialBarChart innerRadius="18%" outerRadius="98%" data={FLEET_RADIAL} startAngle={90} endAngle={-270}>
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar dataKey="value" background cornerRadius={6} />
              <Legend />
              <Tooltip contentStyle={tooltipStyle} />
            </RadialBarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Order-to-delivery funnel"
          caption="Funnel · ERP intake through delivered (sample counts)"
        >
          <ResponsiveContainer>
            <FunnelChart>
              <Tooltip contentStyle={tooltipStyle} />
              <Funnel dataKey="value" data={PIPELINE_FUNNEL} isAnimationActive={false}>
                {PIPELINE_FUNNEL.map((row, index) => (
                  <Cell key={row.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
                <LabelList position="right" fill="#334155" stroke="none" dataKey="name" />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Volume by customer segment"
          caption="Treemap · litres across fleet, ag, residential, cardlock, cylinder"
        >
          <ResponsiveContainer>
            <Treemap data={SEGMENT_TREEMAP} dataKey="size" nameKey="name" stroke="white" fill="var(--primary)" />
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Drop size vs distance"
          caption="Scatter · litres dropped against kilometres from depot"
        >
          <ResponsiveContainer>
            <ScatterChart margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--chrome-border) 65%, transparent)" />
              <XAxis type="number" dataKey="km" name="Distance" unit=" km" tick={{ fontSize: 11 }} label={{ value: "Distance (km)", position: "insideBottom", offset: -2, fontSize: 11 }} />
              <YAxis type="number" dataKey="drop" name="Drop" unit=" L" tick={{ fontSize: 11 }} label={{ value: "Drop (L)", angle: -90, position: "insideLeft", fontSize: 11 }} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={tooltipStyle} />
              <Scatter data={DROP_SCATTER} fill="var(--primary)" />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Corridor quality radar"
          caption="Radar · on-time, litres/km, drop size, safety, fill % by route"
        >
          <ResponsiveContainer>
            <RadarChart data={ROUTE_RADAR}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fontSize: 10 }} />
              <Radar name="RD-North" dataKey="north" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.25} />
              <Radar name="Lacombe" dataKey="lacombe" stroke="var(--secondary)" fill="var(--secondary)" fillOpacity={0.18} />
              <Radar name="Innisfail" dataKey="innisfail" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.12} />
              <Legend />
              <Tooltip contentStyle={tooltipStyle} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="app-surface-card p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-[var(--sidebar-text)]">Dispatch intensity heatmap</h2>
          <p className="mt-0.5 text-[11px] text-[var(--chrome-muted)]">
            Weekday × hour · sample load on the planning board (darker = more dispatches)
          </p>
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[420px]">
              <div className="mb-1 grid grid-cols-[3rem_repeat(8,minmax(0,1fr))] gap-1 text-center text-[10px] font-semibold text-[var(--chrome-muted)]">
                <span />
                {HEAT_HOURS.map((hour) => (
                  <span key={hour}>{hour}:00</span>
                ))}
              </div>
              {HEAT_DAYS.map((day, row) => (
                <div key={day} className="mb-1 grid grid-cols-[3rem_repeat(8,minmax(0,1fr))] gap-1">
                  <span className="self-center text-[11px] font-semibold text-[var(--chrome-muted)]">{day}</span>
                  {DISPATCH_HEAT[row]!.map((value, col) => (
                    <div
                      key={`${day}-${col}`}
                      title={`${day} ${HEAT_HOURS[col]}:00 · intensity ${value}`}
                      className="h-8 rounded-md"
                      style={{ background: heatTone(value) }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="app-surface-card p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-[var(--sidebar-text)]">Days of cover by depot × product</h2>
          <p className="mt-0.5 text-[11px] text-[var(--chrome-muted)]">
            Inventory heatmap · sample forward cover (days) at each supply point
          </p>
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[380px]">
              <div className="mb-1 grid grid-cols-[6.5rem_repeat(4,minmax(0,1fr))] gap-1 text-center text-[10px] font-semibold text-[var(--chrome-muted)]">
                <span />
                {DEPOT_PRODUCT_HEAT.products.map((product) => (
                  <span key={product}>{product}</span>
                ))}
              </div>
              {DEPOT_PRODUCT_HEAT.depots.map((depot, row) => (
                <div key={depot} className="mb-1 grid grid-cols-[6.5rem_repeat(4,minmax(0,1fr))] gap-1">
                  <span className="self-center truncate text-[11px] font-semibold text-[var(--chrome-muted)]">{depot}</span>
                  {DEPOT_PRODUCT_HEAT.coverDays[row]!.map((days, col) => (
                    <div
                      key={`${depot}-${col}`}
                      title={`${depot} ${DEPOT_PRODUCT_HEAT.products[col]} · ${days} days cover`}
                      className="flex h-9 items-center justify-center rounded-md text-[11px] font-semibold text-[var(--sidebar-text)]"
                      style={{ background: heatTone(days, 14) }}
                    >
                      {days.toFixed(1)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <section className="app-surface-card overflow-hidden p-0 xl:col-span-2">
          <div className="border-b border-[color:var(--chrome-border)]/70 px-5 py-4">
            <h2 className="text-sm font-semibold text-[var(--sidebar-text)]">Run-out risk queue</h2>
            <p className="mt-0.5 text-[11px] text-[var(--chrome-muted)]">Telemetry tanks ranked by consequence score</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-2">Account</th>
                  <th className="px-4 py-2">Level</th>
                  <th className="px-4 py-2">Days</th>
                  <th className="px-4 py-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {RUNOUT_QUEUE.map((row) => (
                  <tr key={row.account}>
                    <td className="px-4 py-2">
                      <p className="font-semibold text-[var(--sidebar-text)]">{row.account}</p>
                      <p className="text-[11px] text-[var(--chrome-muted)]">
                        {row.city} · {row.product}
                      </p>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-8 font-mono text-xs">{row.level}%</span>
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                          <span className="block h-full bg-[var(--warning)]" style={{ width: `${row.level}%` }} />
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.days <= 2 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                        {row.days}d
                      </span>
                    </td>
                    <td className="px-4 py-2 font-semibold">{row.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="app-surface-card overflow-hidden p-0 xl:col-span-3">
          <div className="border-b border-[color:var(--chrome-border)]/70 px-5 py-4">
            <h2 className="text-sm font-semibold text-[var(--sidebar-text)]">Live delivery transactions</h2>
            <p className="mt-0.5 text-[11px] text-[var(--chrome-muted)]">
              Sample tickets across forecast, will-call, emergency, telemetry and first-fill origins
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-2">Ticket</th>
                  <th className="px-4 py-2">Account</th>
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2">Qty (L)</th>
                  <th className="px-4 py-2">Origin</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Route</th>
                  <th className="px-4 py-2">Window</th>
                </tr>
              </thead>
              <tbody>
                {TRANSACTIONS.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2 font-mono text-xs font-semibold">{row.id}</td>
                    <td className="px-4 py-2">{row.account}</td>
                    <td className="px-4 py-2">{row.product}</td>
                    <td className="px-4 py-2 font-mono text-xs">{row.qty.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-2">{row.origin}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">{row.route}</td>
                    <td className="px-4 py-2 text-[var(--chrome-muted)]">{row.window}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
