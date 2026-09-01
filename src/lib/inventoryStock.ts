export interface InventoryStockLocation {
  id: string;
  type: "warehouse" | "rav";
}

export interface InventoryStockRecord {
  warehouseStock?: Record<string, number>;
  warehouseTotal?: number;
  vanTotal?: number;
}

/**
 * Maps legacy aggregate stock onto its sole configured location. Older records
 * stored totals without a location entry (or used a retired location id).
 */
export function resolvedStockByLocation(
  item: InventoryStockRecord | null | undefined,
  locations: InventoryStockLocation[]
): Record<string, number> {
  const stock = Object.fromEntries(
    Object.entries(item?.warehouseStock || {}).map(([id, quantity]) => [
      id,
      Number(quantity || 0),
    ])
  );

  (["warehouse", "rav"] as const).forEach((type) => {
    const typeLocations = locations.filter((location) => location.type === type);
    if (typeLocations.length !== 1) return;

    const configuredTotal = typeLocations.reduce(
      (total, location) => total + Number(stock[location.id] || 0),
      0
    );
    const savedTotal = Number(
      type === "warehouse" ? item?.warehouseTotal || 0 : item?.vanTotal || 0
    );
    const missingQuantity = savedTotal - configuredTotal;

    if (missingQuantity > 0) {
      const locationId = typeLocations[0].id;
      stock[locationId] = Number(stock[locationId] || 0) + missingQuantity;
    }
  });

  return stock;
}

export function stockTotals(
  stock: Record<string, number>,
  locations: InventoryStockLocation[]
) {
  const totalFor = (type: InventoryStockLocation["type"]) =>
    locations
      .filter((location) => location.type === type)
      .reduce((total, location) => total + Number(stock[location.id] || 0), 0);
  const warehouseTotal = totalFor("warehouse");
  const vanTotal = totalFor("rav");

  return { warehouseTotal, vanTotal, grandTotal: warehouseTotal + vanTotal };
}
