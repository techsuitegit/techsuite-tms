export type OrderMode = "FORECAST" | "MONITOR" | "SCHEDULED" | "WILL_CALL";
export type OrderStatus = "OPEN" | "CANCELLED" | "CLOSED";
export type QualOutcome = "PENDING" | "QUALIFIED" | "FLAGGED" | "CANNOT_EVALUATE" | "REJECTED";

export type OrderInput = {
  orderNo: string;
  externalId: string | null;
  customerCode: string;
  customerName: string | null;
  materialId: string;
  storageTankId: string | null;
  shippingPointId: string | null;
  divisionId: string | null;
  isPacked: boolean;
  mode: OrderMode;
  dueDate: string;
  requestedQty: number;
  requestedQtyUomId: string;
  orderValue: number;
  notes: string | null;
  versionNo?: number;
};
