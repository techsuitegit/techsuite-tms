export const DASHBOARD_AS_OF = "Monday 17 Aug 2026 · Central division";

export const KPI_CARDS = [
  { key: "orders", label: "Open orders", value: "186", hint: "142 qualified · 31 pending · 13 disqualified", delta: "+8 vs yesterday", up: true },
  { key: "demand", label: "Open demand", value: "248.6k L", hint: "₹ 1.84 Cr ticket value", delta: "+4.2% vs 4-wk avg", up: true },
  { key: "runout", label: "Run-out risk", value: "11", hint: "4 critical · 7 high", delta: "Same-day cover 82%", up: false },
  { key: "routes", label: "Routes dispatched", value: "14 / 18", hint: "212 stops planned", delta: "6 still in planning", up: true },
  { key: "fleet", label: "Fleet utilisation", value: "87%", hint: "22 assigned · 4 available · 3 PTL", delta: "+5 pts vs last week", up: true },
  { key: "ontime", label: "On-time arrivals", value: "93.4%", hint: "8 delay alerts live", delta: "−1.1 pts vs plan", up: false },
] as const;

export const MODULE_PULSE = [
  { id: "01", name: "Master Data", health: 98 },
  { id: "02", name: "Qualification", health: 91 },
  { id: "03", name: "Ranking", health: 94 },
  { id: "04", name: "Stock Reserve", health: 88 },
  { id: "05", name: "Delivery Plan", health: 86 },
  { id: "06", name: "Loading / PTL", health: 84 },
  { id: "07", name: "Map Planning", health: 90 },
  { id: "08", name: "Telemetry", health: 96 },
  { id: "09", name: "Drivers", health: 89 },
  { id: "10", name: "Mobile / PoD", health: 92 },
] as const;

export const DAILY_DELIVERIES = [
  { day: "04 Aug", propane: 38, ulsd: 22, gasoline: 14, heating: 8 },
  { day: "05 Aug", propane: 41, ulsd: 19, gasoline: 16, heating: 7 },
  { day: "06 Aug", propane: 36, ulsd: 24, gasoline: 12, heating: 9 },
  { day: "07 Aug", propane: 44, ulsd: 21, gasoline: 15, heating: 6 },
  { day: "08 Aug", propane: 29, ulsd: 18, gasoline: 11, heating: 5 },
  { day: "09 Aug", propane: 18, ulsd: 12, gasoline: 7, heating: 3 },
  { day: "10 Aug", propane: 16, ulsd: 10, gasoline: 6, heating: 2 },
  { day: "11 Aug", propane: 42, ulsd: 23, gasoline: 17, heating: 8 },
  { day: "12 Aug", propane: 47, ulsd: 25, gasoline: 15, heating: 9 },
  { day: "13 Aug", propane: 45, ulsd: 22, gasoline: 18, heating: 7 },
  { day: "14 Aug", propane: 49, ulsd: 26, gasoline: 16, heating: 10 },
  { day: "15 Aug", propane: 39, ulsd: 20, gasoline: 14, heating: 8 },
  { day: "16 Aug", propane: 21, ulsd: 11, gasoline: 8, heating: 4 },
  { day: "17 Aug", propane: 52, ulsd: 28, gasoline: 19, heating: 11 },
];

export const ROUTE_VOLUME = [
  { route: "RD-North", litres: 42800, km: 186 },
  { route: "Lacombe Loop", litres: 36100, km: 142 },
  { route: "Innisfail Mix", litres: 29400, km: 128 },
  { route: "Ponoka Ag", litres: 27600, km: 164 },
  { route: "Stettler East", litres: 22100, km: 198 },
  { route: "Bowden Fleet", litres: 19800, km: 96 },
  { route: "Alix Commercial", litres: 17200, km: 88 },
];

export const PRODUCT_MIX = [
  { name: "Propane", value: 112400, fill: "var(--primary)" },
  { name: "ULSD", value: 61800, fill: "var(--secondary)" },
  { name: "Gasoline", value: 41200, fill: "var(--accent)" },
  { name: "Heating oil", value: 33200, fill: "var(--success)" },
];

export const ORDER_ORIGIN = [
  { name: "Forecast / telemetry", value: 94 },
  { name: "Scheduled cycle", value: 41 },
  { name: "Will-call", value: 28 },
  { name: "Emergency", value: 12 },
  { name: "First fill", value: 11 },
];

export const ORDER_STATUS = [
  { name: "Qualified", value: 142 },
  { name: "Pending", value: 31 },
  { name: "Disqualified", value: 13 },
  { name: "Fulfilled", value: 268 },
];

export const DELIVERY_STATUS = [
  { name: "Scheduled", value: 64 },
  { name: "In transit", value: 48 },
  { name: "Completed", value: 129 },
  { name: "Delayed", value: 8 },
];

export const FORECAST_VS_ACTUAL = [
  { day: "11 Aug", forecast: 86, actual: 82, projected: 86 },
  { day: "12 Aug", forecast: 91, actual: 96, projected: 91 },
  { day: "13 Aug", forecast: 88, actual: 84, projected: 88 },
  { day: "14 Aug", forecast: 94, actual: 101, projected: 94 },
  { day: "15 Aug", forecast: 79, actual: 81, projected: 79 },
  { day: "16 Aug", forecast: 42, actual: 44, projected: 42 },
  { day: "17 Aug", forecast: 102, actual: 110, projected: 102 },
  { day: "18 Aug", forecast: 96, actual: null, projected: 96 },
  { day: "19 Aug", forecast: 93, actual: null, projected: 93 },
  { day: "20 Aug", forecast: 98, actual: null, projected: 98 },
];

export const PIPELINE_FUNNEL = [
  { name: "ERP orders", value: 454 },
  { name: "Qualified", value: 411 },
  { name: "Ranked A1–A3", value: 386 },
  { name: "Stock reserved", value: 341 },
  { name: "Routed", value: 298 },
  { name: "Dispatched", value: 249 },
  { name: "Delivered", value: 129 },
];

export const FLEET_RADIAL = [
  { name: "Utilisation", value: 87, fill: "var(--primary)" },
  { name: "Plan adherence", value: 81, fill: "var(--secondary)" },
  { name: "Fill vs target", value: 74, fill: "var(--accent)" },
  { name: "HOS headroom", value: 68, fill: "var(--success)" },
];

export const SEGMENT_TREEMAP = [
  { name: "Commercial fleet", size: 84200 },
  { name: "Agriculture", size: 51600 },
  { name: "Residential auto", size: 44800 },
  { name: "Cardlock / wholesale", size: 31200 },
  { name: "Cylinder exchange", size: 18600 },
  { name: "First fill / new sites", size: 12400 },
];

export const DROP_SCATTER = [
  { km: 12, drop: 2100, segment: "City" },
  { km: 18, drop: 3400, segment: "City" },
  { km: 24, drop: 1800, segment: "City" },
  { km: 36, drop: 5200, segment: "Rural" },
  { km: 42, drop: 6100, segment: "Rural" },
  { km: 48, drop: 2800, segment: "Rural" },
  { km: 55, drop: 7400, segment: "Ag" },
  { km: 61, drop: 8600, segment: "Ag" },
  { km: 28, drop: 4100, segment: "Fleet" },
  { km: 33, drop: 9300, segment: "Fleet" },
  { km: 71, drop: 4700, segment: "Rural" },
  { km: 15, drop: 1500, segment: "City" },
];

export const ROUTE_RADAR = [
  { metric: "On-time", north: 94, lacombe: 91, innisfail: 88, ponoka: 86 },
  { metric: "L / km", north: 230, lacombe: 254, innisfail: 230, ponoka: 168 },
  { metric: "Drop size", north: 78, lacombe: 84, innisfail: 71, ponoka: 90 },
  { metric: "Safety", north: 92, lacombe: 88, innisfail: 95, ponoka: 90 },
  { metric: "Fill %", north: 81, lacombe: 86, innisfail: 74, ponoka: 79 },
];

export const STOCK_BY_PRODUCT = [
  { product: "Propane", reserved: 86, available: 124, dispatched: 52 },
  { product: "ULSD", reserved: 41, available: 68, dispatched: 28 },
  { product: "Gasoline", reserved: 22, available: 39, dispatched: 19 },
  { product: "Heating oil", reserved: 18, available: 27, dispatched: 11 },
];

export const HEAT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const HEAT_HOURS = ["05", "07", "09", "11", "13", "15", "17", "19"] as const;

/** Dispatch intensity 0–100 by weekday × hour (sample). */
export const DISPATCH_HEAT: number[][] = [
  [12, 48, 86, 92, 74, 61, 38, 14],
  [10, 52, 90, 88, 71, 58, 33, 11],
  [14, 55, 94, 91, 69, 64, 41, 16],
  [11, 49, 84, 96, 78, 62, 36, 12],
  [9, 44, 81, 87, 70, 55, 29, 8],
  [4, 18, 28, 22, 16, 12, 6, 2],
  [3, 12, 16, 14, 10, 8, 4, 1],
];

export const DEPOT_PRODUCT_HEAT = {
  depots: ["Red Deer", "Lacombe", "Innisfail", "Ponoka", "Stettler"],
  products: ["Propane", "ULSD", "Gasoline", "Heating"],
  coverDays: [
    [11.2, 8.4, 6.1, 9.8],
    [9.6, 12.1, 5.4, 7.2],
    [7.8, 6.9, 8.8, 10.4],
    [13.4, 9.1, 4.2, 6.6],
    [8.1, 5.7, 7.4, 11.9],
  ],
};

export const TRANSACTIONS = [
  { id: "TKT-18421", account: "Willow Creek Ranch", product: "Propane", qty: 9500, origin: "Forecast", status: "In transit", route: "Ponoka Ag", window: "09:30–12:00" },
  { id: "TKT-18428", account: "Alix Auto Transport", product: "ULSD", qty: 11400, origin: "Scheduled", status: "Dispatched", route: "Alix Commercial", window: "08:00–11:00" },
  { id: "TKT-18433", account: "Red Deer Terminal", product: "Propane", qty: 6200, origin: "Telemetry", status: "Completed", route: "RD-North", window: "07:15–09:00" },
  { id: "TKT-18440", account: "Bowden Co-op", product: "Gasoline", qty: 4800, origin: "Will-call", status: "Delayed", route: "Bowden Fleet", window: "10:00–13:00" },
  { id: "TKT-18447", account: "Innisfail Foods", product: "Propane", qty: 3100, origin: "Emergency", status: "Qualified", route: "Innisfail Mix", window: "13:00–16:00" },
  { id: "TKT-18452", account: "Stettler Grain", product: "ULSD", qty: 8700, origin: "Forecast", status: "Reserved", route: "Stettler East", window: "11:00–15:00" },
  { id: "TKT-18459", account: "Lacombe Hospital", product: "Heating oil", qty: 5400, origin: "Telemetry", status: "In transit", route: "Lacombe Loop", window: "06:30–09:30" },
  { id: "TKT-18466", account: "First-fill · C-4412", product: "Propane", qty: 2200, origin: "First fill", status: "Pending", route: "Unassigned", window: "TBD" },
];

export const RUNOUT_QUEUE = [
  { account: "Ponoka Poultry", city: "Ponoka", level: 11, days: 1.2, score: 96, product: "Propane" },
  { account: "Highway 2 Cardlock", city: "Red Deer", level: 14, days: 1.8, score: 91, product: "ULSD" },
  { account: "Lacombe Care Home", city: "Lacombe", level: 18, days: 2.1, score: 88, product: "Heating oil" },
  { account: "Bowden School Div.", city: "Bowden", level: 22, days: 2.6, score: 81, product: "Propane" },
  { account: "Alix Transport Yard", city: "Alix", level: 24, days: 3.0, score: 76, product: "ULSD" },
  { account: "Stettler Elevator", city: "Stettler", level: 27, days: 3.4, score: 71, product: "ULSD" },
];

export const PIE_COLORS = ["var(--primary)", "var(--secondary)", "var(--accent)", "var(--success)", "var(--warning)", "#64748b"];
