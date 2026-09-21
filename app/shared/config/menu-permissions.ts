export type MenuChildItem = {
  key: string;
  href: string;
  label: string;
};

export type MenuNavItem = {
  key: string;
  label: string;
  href?: string;
  children?: MenuChildItem[];
};

export const MASTER_MENU_ITEMS: MenuChildItem[] = [
  { key: "ShippingPoint", href: "/masters/shipping-point", label: "Shipping Point" },
  { key: "CostCenter", href: "/masters/cost-center", label: "Cost Center" },
  { key: "StorageTank", href: "/masters/storage-tank", label: "Storage Tank" },
  { key: "Material", href: "/masters/material", label: "Material" },
  { key: "UnitOfMeasurement", href: "/masters/unit-of-measurement", label: "Unit of Measurement" },
  { key: "Truck", href: "/masters/truck", label: "Truck" },
  { key: "Cylinder", href: "/masters/cylinder", label: "Cylinder" },
  { key: "Telemetry", href: "/masters/telemetry", label: "Telemetry" },
  { key: "Haulier", href: "/masters/haulier", label: "Haulier" },
  { key: "VendorSupplier", href: "/masters/vendor-supplier", label: "Vendor / Supplier" },
];

export const MENU_NAV_ITEMS: MenuNavItem[] = [
  { key: "Dashboard", href: "/dashboard", label: "Dashboard" },
  { key: "MapPointers", href: "/map-pointers", label: "Map & Pointers" },
  { key: "Masters", label: "Masters", children: MASTER_MENU_ITEMS },
];

export const MENU_PERMISSION_KEYS = ["Dashboard", "MapPointers", "Masters"] as const;

export type MenuPermissionKey = (typeof MENU_PERMISSION_KEYS)[number];

export const MENU_PERMISSION_ITEMS = MENU_NAV_ITEMS.filter(
  (item): item is MenuNavItem & { href: string } => Boolean(item.href),
);

export function masterLabelForSlug(slug: string): string | null {
  return MASTER_MENU_ITEMS.find((item) => item.href === `/masters/${slug}`)?.label ?? null;
}

export function isMenuAllowed(_permission: unknown, _key: MenuPermissionKey): boolean {
  return true;
}

export function isPathAllowed(_pathname: string, _permission: unknown): boolean {
  return true;
}

export function firstAllowedPath(_permission: unknown): string | null {
  return "/dashboard";
}
