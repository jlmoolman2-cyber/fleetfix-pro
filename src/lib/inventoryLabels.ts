export type InventoryLabelSettings = {
  mediaType: "roll" | "sheet";
  pageWidthMm: number;
  pageHeightMm: number;
  labelWidthMm: number;
  labelHeightMm: number;
  columns: number;
  gapXMm: number;
  gapYMm: number;
  marginMm: number;
  fontSizePt: number;
  fontFamily?: string;
  textColor?: string;
  showBorder: boolean;
  fieldOrder: string[];
  fields: Array<{ id: string; source: string; caption: string; showCaption?: boolean; align?: "left" | "center" | "right"; fontSizePt?: number; offsetXMm?: number; offsetYMm?: number; fontFamily?: string; textColor?: string; backgroundColor?: string }>;
  codeType: "none" | "barcode" | "qr";
  codeFields: string[];
  showCodeText: boolean;
  codeAlign?: "left" | "center" | "right";
  codeOrder?: number;
  codeWidthMm?: number;
  codeHeightMm?: number;
  codeOffsetXMm?: number;
  codeOffsetYMm?: number;
};

export const defaultInventoryLabelSettings: InventoryLabelSettings = {
  mediaType: "roll",
  pageWidthMm: 210,
  pageHeightMm: 297,
  labelWidthMm: 40,
  labelHeightMm: 30,
  columns: 1,
  gapXMm: 0,
  gapYMm: 0,
  marginMm: 1.5,
  fontSizePt: 7,
  fontFamily: "Arial, Helvetica, sans-serif",
  textColor: "#000000",
  showBorder: false,
  fieldOrder: ["partNumber", "description", "barcode", "sellPrice"],
  fields: [
    { id: "partNumber", source: "partNumber", caption: "Part Number", showCaption: true, align: "left", fontSizePt: 7 },
    { id: "description", source: "description", caption: "Description", showCaption: true, align: "left", fontSizePt: 7 },
    { id: "sellPrice", source: "sellPrice", caption: "Sell Price", showCaption: true, align: "left", fontSizePt: 7 },
  ],
  codeType: "barcode",
  codeFields: ["partNumber"],
  showCodeText: true,
  codeAlign: "center",
  codeOrder: 3,
  codeWidthMm: 12,
  codeHeightMm: 12,
  codeOffsetXMm: 0,
  codeOffsetYMm: 0,
};

export const inventoryLabelFields = [
  ["partNumber", "Part Number"], ["description", "Description"], ["barcode", "Barcode"],
  ["category", "Category"], ["brand", "Brand"], ["sellPrice", "Sell Price"],
  ["costPrice", "Cost Price"], ["stockQty", "Quantity On Hand"], ["unit", "Unit"],
] as const;
