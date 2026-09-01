"use client";

import {
    useState,
    useEffect,
    useRef
} from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

import {
    Package,
    Warehouse,
    Truck,
    Ruler,
    Plus,
    Save,
    Pencil,
    Trash2,
    ListPlus,
} from "lucide-react";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp
}
    from "firebase/firestore";


import { clientDb }
    from "@/lib/firebaseClient";


import { COMPANY_ID }
    from "@/lib/company";
import { defaultInventoryLabelSettings, inventoryLabelFields, type InventoryLabelSettings } from "@/lib/inventoryLabels";
import { printLabelsInCleanWindow } from "@/lib/printLabels";

type LabelPreset = { id: string; name: string; settings: InventoryLabelSettings };

type LabelField = InventoryLabelSettings["fields"][number];

function firestoreSafeLabelSettings(settings: InventoryLabelSettings): InventoryLabelSettings {
    const { savedSetups: _savedSetups, updatedAt: _updatedAt, ...labelOnlySettings } = settings as InventoryLabelSettings & { savedSetups?: unknown; updatedAt?: unknown };
    return JSON.parse(JSON.stringify(labelOnlySettings)) as InventoryLabelSettings;
}

const LABEL_PRESET_CACHE_KEY = `fleetfix:${COMPANY_ID}:stock-label-templates`;

function cacheLabelPresets(presets: LabelPreset[]) {
    window.localStorage.setItem(LABEL_PRESET_CACHE_KEY, JSON.stringify(presets));
}

function readCachedLabelPresets(): LabelPreset[] {
    try {
        const value = JSON.parse(window.localStorage.getItem(LABEL_PRESET_CACHE_KEY) || "[]") as LabelPreset[];
        return Array.isArray(value) ? value.filter((preset) => preset?.id && preset?.name && preset?.settings) : [];
    } catch {
        return [];
    }
}

function FieldStyleControls({ field, defaultFont, onChange }: { field: LabelField; defaultFont: string; onChange: (changes: Partial<LabelField>) => void }) {
    const hasFill = Boolean(field.backgroundColor && field.backgroundColor !== "transparent");
    return <div className="flex items-center gap-1 whitespace-nowrap"><select value={field.fontFamily ?? ""} onChange={(event) => onChange({ fontFamily: event.target.value || undefined })} className="h-10 max-w-28 rounded-lg border px-2" aria-label={`Font for ${field.caption}`}><option value="">Label font</option><option value="Arial, Helvetica, sans-serif">Arial</option><option value="Verdana, Geneva, sans-serif">Verdana</option><option value="Tahoma, Geneva, sans-serif">Tahoma</option><option value="'Trebuchet MS', sans-serif">Trebuchet</option><option value="Georgia, serif">Georgia</option><option value="'Courier New', monospace">Courier</option></select><label className="flex items-center gap-1 text-[10px] font-bold">Text<input type="color" value={field.textColor ?? "#000000"} onChange={(event) => onChange({ textColor: event.target.value })} className="h-8 w-8 cursor-pointer p-0" /></label><label className="flex items-center gap-1 text-[10px] font-bold"><input type="checkbox" checked={hasFill} onChange={(event) => onChange({ backgroundColor: event.target.checked ? "#ffffff" : "transparent" })} />Box</label><input type="color" disabled={!hasFill} value={hasFill ? field.backgroundColor : "#ffffff"} onChange={(event) => onChange({ backgroundColor: event.target.value })} className="h-8 w-8 cursor-pointer p-0 disabled:opacity-30" aria-label={`Box colour for ${field.caption}`} title={`Uses ${field.fontFamily || defaultFont}`} /></div>;
}

function NumberSetting({ label, value, onChange, disabled = false, min = 0 }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean; min?: number }) {
    return <label className="font-bold">{label}<input type="number" min={min} step="0.1" disabled={disabled} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 h-12 w-full rounded-xl border px-3 disabled:bg-gray-100" /></label>;
}

function SampleLabelCode({ type, showText, align, widthMm, heightMm, offsetXMm, offsetYMm }: { type: InventoryLabelSettings["codeType"]; showText: boolean; align: InventoryLabelSettings["codeAlign"]; widthMm: number; heightMm: number; offsetXMm: number; offsetYMm: number }) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [qrUrl, setQrUrl] = useState("");
    const value = "PART-001";
    useEffect(() => {
        if (type === "qr") void QRCode.toDataURL(value, { margin: 0, width: 160, errorCorrectionLevel: "M" }).then(setQrUrl);
        if (type === "barcode" && svgRef.current) JsBarcode(svgRef.current, value, { format: "CODE128", displayValue: false, margin: 0, height: 34, width: 1.2 });
    }, [type]);
    if (type === "none") return null;
    const horizontalPosition = align === "left" ? { left: 0 } : align === "right" ? { right: 0 } : { left: "50%" };
    const centreShift = align === "center" ? "translateX(-50%) " : "";
    return <div className={`absolute bottom-0 z-10 flex flex-col overflow-visible ${align === "left" ? "items-start" : align === "right" ? "items-end" : "items-center"}`} style={{ ...horizontalPosition, transform: `${centreShift}translate(${offsetXMm}mm, ${offsetYMm}mm)` }}>{type === "qr" ? (qrUrl ? <img src={qrUrl} alt="Sample QR code" className="object-contain" style={{ width: `${widthMm}mm`, height: `${heightMm}mm` }} /> : <span aria-hidden="true" style={{ width: `${widthMm}mm`, height: `${heightMm}mm` }} />) : <svg ref={svgRef} aria-label="Sample barcode" style={{ width: `${widthMm}mm`, height: `${heightMm}mm`, maxWidth: "100%" }} />}{showText ? <span className="max-w-full truncate text-[0.65em] font-bold">{value}</span> : null}</div>;
}

export default function InventorySettingsPage() {

    const [activeTab, setActiveTab] =
        useState<
            "general" |
            "units" |
            "warehouses" |
            "vans" |
            "labels" |
            "customFields"
        >("general");

    type CustomFieldType =
        "text" | "number" | "date" | "time" | "textarea";

    interface CustomFieldDefinition {
        id: string;
        label: string;
        type: CustomFieldType;
        required: boolean;
    }

    const [customFields, setCustomFields] =
        useState<CustomFieldDefinition[]>([]);

    const [newFieldLabel, setNewFieldLabel] =
        useState("");

    const [newFieldType, setNewFieldType] =
        useState<CustomFieldType>("text");

    const [newFieldRequired, setNewFieldRequired] =
        useState(false);
    const [labelSettings, setLabelSettings] = useState<InventoryLabelSettings>(defaultInventoryLabelSettings);
    const [savedLabelSettings, setSavedLabelSettings] = useState<InventoryLabelSettings | null>(null);
    const [labelPresets, setLabelPresets] = useState<LabelPreset[]>([]);
    const [selectedLabelPreset, setSelectedLabelPreset] = useState("");
    const [labelPresetName, setLabelPresetName] = useState("");
    const [labelPresetError, setLabelPresetError] = useState("");
    const [labelItemField, setLabelItemField] = useState("partNumber");
    const [labelCustomField, setLabelCustomField] = useState("");

    const [inventoryPrefix, setInventoryPrefix] =
        useState("STOCK");

    const [currentNumber, setCurrentNumber] =
        useState("1000");
    const [allowNegativeStock, setAllowNegativeStock] = useState(false);
    const [requisitionPrefix, setRequisitionPrefix] = useState("REQ-");
    const [requisitionCurrentNumber, setRequisitionCurrentNumber] = useState("0");
    const [derequisitionPrefix, setDerequisitionPrefix] = useState("DREQ-");
    const [derequisitionCurrentNumber, setDerequisitionCurrentNumber] = useState("0");
    const [replenishmentPrefix, setReplenishmentPrefix] = useState("RPL-");
    const [replenishmentCurrentNumber, setReplenishmentCurrentNumber] = useState("0");

    const [units, setUnits] =
        useState([
            "Each",
            "Box",
            "Liter",
            "Kilogram",
        ]);

    const [warehouses, setWarehouses]
        =
        useState<any[]>([]);

    const [vans, setVans]
        =
        useState<any[]>([]);

    const [newUnit, setNewUnit] =
        useState("");

    const [newWarehouse, setNewWarehouse] =
        useState("");

    const [editingWarehouseId, setEditingWarehouseId] =
        useState<string | null>(null);

    const [editingWarehouseName, setEditingWarehouseName] =
        useState("");

    const [newVan, setNewVan] =
        useState("");

    const [editingVanId, setEditingVanId] =
        useState<number | null>(null);

    const [editingVanName, setEditingVanName] =
        useState("");

    const nextNumber =
        `${inventoryPrefix}${Number(currentNumber) + 1}`;

    const [users] = useState([
        "Lafras Moolman",
        "Workshop Admin",
        "Technician 1",
    ]);

    const [inventoryItems] = useState([
        {
            id: 1,
            name: "Oil Filter",
            linkedVanId: 1,
        },
        {
            id: 2,
            name: "Brake Pads",
            linkedVanId: null,
        },
    ]);

    useEffect(() => {

        loadInventorySettings();

    }, []);



    async function loadInventorySettings() {

        const cachedPresets = readCachedLabelPresets();
        setLabelPresets(cachedPresets);

        const numberingSnap = await getDoc(doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "setup"));
        if (numberingSnap.exists()) {
            const numbering = numberingSnap.data();
            setInventoryPrefix(String(numbering.inventoryPrefix || "STOCK"));
            setCurrentNumber(String(numbering.currentNumber ?? "1000"));
            setAllowNegativeStock(numbering.allowNegativeStock === true);
            setRequisitionPrefix(String(numbering.requisitionPrefix || "REQ-"));
            setRequisitionCurrentNumber(String(numbering.requisitionCurrentNumber ?? "0"));
            setDerequisitionPrefix(String(numbering.derequisitionPrefix || "DREQ-"));
            setDerequisitionCurrentNumber(String(numbering.derequisitionCurrentNumber ?? "0"));
            setReplenishmentPrefix(String(numbering.replenishmentPrefix || "RPL-"));
            setReplenishmentCurrentNumber(String(numbering.replenishmentCurrentNumber ?? "0"));
        }
        const labelSnap = await getDoc(doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "stock_labels"));
        if (labelSnap.exists()) {
            const labelData = labelSnap.data();
            const { savedSetups: _savedSetups, updatedAt: _updatedAt, ...labelOnlyData } = labelData;
            const savedSettings = { ...defaultInventoryLabelSettings, ...labelOnlyData } as InventoryLabelSettings;
            const storedPresets = Array.isArray(labelData.savedSetups)
                ? labelData.savedSetups.map((entry: Partial<LabelPreset>) => ({
                    id: String(entry.id || ""),
                    name: String(entry.name || "Unnamed template"),
                    settings: { ...defaultInventoryLabelSettings, ...(entry.settings || {}) } as InventoryLabelSettings,
                })).filter((entry: LabelPreset) => entry.id)
                : [];
            setSavedLabelSettings(savedSettings);
            setLabelSettings(savedSettings);
            setLabelPresets((current) => [...new Map([...current, ...storedPresets].map((preset) => [preset.id, preset])).values()].sort((a, b) => a.name.localeCompare(b.name)));
            setSelectedLabelPreset((current) => current || "__current__");
        }
        try {
            const presetSnap = await getDocs(collection(clientDb, "companies", COMPANY_ID, "inventory_settings", "stock_labels", "presets"));
            const legacyPresets = presetSnap.docs.map((presetDoc) => ({ id: presetDoc.id, name: String(presetDoc.data().name || "Unnamed template"), settings: { ...defaultInventoryLabelSettings, ...(presetDoc.data().settings || {}) } as InventoryLabelSettings }));
            setLabelPresets((current) => [...new Map([...current, ...legacyPresets].map((preset) => [preset.id, preset])).values()].sort((a, b) => a.name.localeCompare(b.name)));
            setLabelPresetError("");
        } catch (error) {
            console.error("Unable to load saved label setups", error);
            setLabelPresetError("");
        }


        const warehouseSnap =
            await getDocs(

                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "inventory_settings",
                    "setup",
                    "warehouses"
                )

            );


        const loadedWarehouses = warehouseSnap.docs.map(d => ({

                id: d.id,
                ...d.data()

            }));
        if (!loadedWarehouses.some((warehouse: any) => warehouse.id === "MAIN")) {
            const mainWarehouse = { id: "MAIN", name: "Main Warehouse", code: "MAIN", primary: true, active: true };
            await setDoc(doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "setup", "warehouses", "MAIN"), {
                name: mainWarehouse.name,
                code: "MAIN",
                primary: true,
                active: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }, { merge: true });
            loadedWarehouses.unshift(mainWarehouse);
        }
        setWarehouses(loadedWarehouses.sort((a: any, b: any) => a.id === "MAIN" ? -1 : b.id === "MAIN" ? 1 : String(a.name || "").localeCompare(String(b.name || ""))));




        const ravSnap =
            await getDocs(

                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "inventory_settings",
                    "setup",
                    "rav"
                )

            );


        setVans(

            ravSnap.docs.map(d => ({

                id: d.id,
                ...d.data()

            }))

        );

        const customFieldSnap =
            await getDocs(
                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "inventory_settings",
                    "setup",
                    "custom_fields"
                )
            );

        setCustomFields(
            customFieldSnap.docs.map((fieldDoc) => ({
                id: fieldDoc.id,
                label: String(fieldDoc.data().label || ""),
                type: (fieldDoc.data().type || "text") as CustomFieldType,
                required: Boolean(fieldDoc.data().required),
            }))
        );


    }

    async function saveNumberingSettings() {
        await setDoc(doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "setup"), {
            inventoryPrefix: inventoryPrefix.trim() || "STOCK", currentNumber: Number(currentNumber || 0),
            allowNegativeStock,
            requisitionPrefix: requisitionPrefix.trim() || "REQ-", requisitionCurrentNumber: Number(requisitionCurrentNumber || 0),
            derequisitionPrefix: derequisitionPrefix.trim() || "DREQ-", derequisitionCurrentNumber: Number(derequisitionCurrentNumber || 0),
            replenishmentPrefix: replenishmentPrefix.trim() || "RPL-", replenishmentCurrentNumber: Number(replenishmentCurrentNumber || 0),
            updatedAt: serverTimestamp(),
        }, { merge: true });
        alert("Inventory and stock-form numbering settings saved.");
    }

    async function saveLabelSettings() {
        await setDoc(doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "stock_labels"), { ...labelSettings, updatedAt: serverTimestamp() }, { merge: true });
        setSavedLabelSettings(labelSettings);
        setSelectedLabelPreset("__current__");
        alert("Stock label template saved.");
    }

    async function saveLabelPreset() {
        const name = labelPresetName.trim();
        if (!name) { alert("Enter a setup name."); return; }
        const presetsRef = collection(clientDb, "companies", COMPANY_ID, "inventory_settings", "stock_labels", "presets");
        const selectedPreset = labelPresets.find((preset) => preset.id === selectedLabelPreset);
        const sameSelectedName = selectedPreset?.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase();
        const existingWithName = labelPresets.find((preset) => preset.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
        const id = sameSelectedName ? selectedPreset.id : existingWithName?.id ?? doc(presetsRef).id;
        const savedPreset: LabelPreset = { id, name, settings: firestoreSafeLabelSettings(labelSettings) };
        const updatedPresets = [...labelPresets.filter((preset) => preset.id !== id), savedPreset].sort((a, b) => a.name.localeCompare(b.name));
        setLabelPresets(updatedPresets);
        cacheLabelPresets(updatedPresets);
        setSelectedLabelPreset(id);
        try {
            await setDoc(doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "stock_labels"), { savedSetups: updatedPresets, updatedAt: serverTimestamp() }, { merge: true });
            setLabelPresetError("");
            alert("Label setup saved.");
        } catch (error) {
            console.error("Unable to save label setup to Firestore", error);
            setLabelPresetError("Saved in this browser, but cloud saving failed.");
            alert("Label setup saved in this browser. Cloud saving failed.");
        }
    }

    async function saveActiveSettings() {
        if (activeTab === "labels") {
            if (labelPresetName.trim()) await saveLabelPreset();
            else await saveLabelSettings();
            return;
        }
        if (activeTab === "general") {
            await saveNumberingSettings();
            return;
        }
        alert("There are no unsaved settings on this tab.");
    }

    function loadLabelPreset(id: string) {
        setSelectedLabelPreset(id);
        if (id === "__current__" && savedLabelSettings) {
            setLabelPresetName("");
            setLabelSettings(savedLabelSettings);
            return;
        }
        const preset = labelPresets.find((entry) => entry.id === id);
        if (!preset) { setLabelPresetName(""); return; }
        setLabelPresetName(preset.name);
        setLabelSettings({ ...defaultInventoryLabelSettings, ...preset.settings });
    }

    async function removeLabelPreset() {
        if (!selectedLabelPreset || selectedLabelPreset === "__current__" || !confirm("Delete this saved label setup?")) return;
        const updatedPresets = labelPresets.filter((entry) => entry.id !== selectedLabelPreset);
        setLabelPresets(updatedPresets);
        cacheLabelPresets(updatedPresets);
        await setDoc(doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "stock_labels"), { savedSetups: updatedPresets, updatedAt: serverTimestamp() }, { merge: true });
        setSelectedLabelPreset("");
        setLabelPresetName("");
    }

    function addLabelField(source: string, caption: string) {
        if (!source) return;
        setLabelSettings((current) => ({ ...current, fields: [...(current.fields || []), { id: `${source}-${Date.now()}`, source, caption, showCaption: true, align: "left", fontSizePt: current.fontSizePt }] }));
    }

    function moveLabelField(index: number, direction: -1 | 1) {
        setLabelSettings((current) => { const fields = [...(current.fields || [])]; const target = index + direction; if (target < 0 || target >= fields.length) return current; [fields[index], fields[target]] = [fields[target], fields[index]]; return { ...current, fields }; });
    }

    function nudgeLabelField(id: string, axis: "x" | "y", amount: number) {
        setLabelSettings((current) => ({ ...current, fields: current.fields.map((field) => field.id === id ? { ...field, ...(axis === "x" ? { offsetXMm: (field.offsetXMm ?? 0) + amount } : { offsetYMm: (field.offsetYMm ?? 0) + amount }) } : field) }));
    }

    async function addCustomField() {
        const label = newFieldLabel.trim();

        if (!label) {
            alert("Enter a field name");
            return;
        }

        await addDoc(
            collection(
                clientDb,
                "companies",
                COMPANY_ID,
                "inventory_settings",
                "setup",
                "custom_fields"
            ),
            {
                label,
                type: newFieldType,
                required: newFieldRequired,
                createdAt: serverTimestamp(),
            }
        );

        setNewFieldLabel("");
        setNewFieldType("text");
        setNewFieldRequired(false);
        await loadInventorySettings();
    }

    async function removeCustomField(id: string) {
        if (!confirm("Remove this custom field? Existing item values will be retained but hidden.")) {
            return;
        }

        await deleteDoc(
            doc(
                clientDb,
                "companies",
                COMPANY_ID,
                "inventory_settings",
                "setup",
                "custom_fields",
                id
            )
        );

        await loadInventorySettings();
    }

    const previewElements: Array<{ kind: "field"; field: InventoryLabelSettings["fields"][number] } | { kind: "code" }> = (labelSettings.fields || []).map((field) => ({ kind: "field", field }));
    previewElements.splice(Math.min(Math.max(labelSettings.codeOrder ?? previewElements.length, 0), previewElements.length), 0, { kind: "code" });
    const sampleFieldValue = (source: string) => source === "partNumber" ? "PART-001" : source === "description" ? "Sample stock item" : source === "sellPrice" ? "R 100.00" : "Sample";
    const alignmentClass = (align?: "left" | "center" | "right") => align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
    const renderSampleLabelContents = () => <div className="label-preview-content relative flex h-full min-h-0 flex-col justify-center" style={{ fontFamily: labelSettings.fontFamily ?? defaultInventoryLabelSettings.fontFamily, color: labelSettings.textColor ?? "#000000" }}>{previewElements.map((element, index) => element.kind === "code"
        ? <SampleLabelCode key="sample-code" type={labelSettings.codeType} showText={labelSettings.showCodeText} align={labelSettings.codeAlign} widthMm={labelSettings.codeWidthMm ?? 12} heightMm={labelSettings.codeHeightMm ?? 12} offsetXMm={labelSettings.codeOffsetXMm ?? 0} offsetYMm={labelSettings.codeOffsetYMm ?? 0} />
        : <div key={`${element.field.id}-${index}`} className={`${alignmentClass(element.field.align)} min-w-0 whitespace-normal break-words`} style={{ fontSize: `${element.field.fontSizePt ?? labelSettings.fontSizePt}pt`, fontFamily: element.field.fontFamily ?? labelSettings.fontFamily, color: element.field.textColor ?? labelSettings.textColor, backgroundColor: element.field.backgroundColor && element.field.backgroundColor !== "transparent" ? element.field.backgroundColor : undefined, paddingRight: labelSettings.codeType !== "none" && labelSettings.codeAlign !== "left" ? `${(labelSettings.codeWidthMm ?? 12) + 1}mm` : undefined, paddingLeft: labelSettings.codeType !== "none" && labelSettings.codeAlign === "left" ? `${(labelSettings.codeWidthMm ?? 12) + 1}mm` : undefined, transform: `translate(${element.field.offsetXMm ?? 0}mm, ${element.field.offsetYMm ?? 0}mm)` }}>{element.field.showCaption !== false ? <span className="text-[0.72em] font-bold uppercase text-gray-500">{element.field.caption}: </span> : null}<strong>{sampleFieldValue(element.field.source)}</strong></div>)}</div>;

    return (

        <div className="inventory-label-admin min-h-screen bg-[#f4f7fb] p-8">
            <style>{`@media print{@page{size:${labelSettings.mediaType === "roll" ? `${labelSettings.labelWidthMm}mm ${labelSettings.labelHeightMm}mm` : `${labelSettings.pageWidthMm}mm ${labelSettings.pageHeightMm}mm`};margin:0}.inventory-label-admin>*:not(.label-sample-print){display:none!important}.inventory-label-admin .label-sample-print{display:${labelSettings.mediaType === "roll" ? "block" : "grid"}!important;position:absolute!important;left:0!important;top:0!important;grid-template-columns:repeat(${Math.max(1, labelSettings.columns)},${labelSettings.labelWidthMm}mm);gap:${labelSettings.gapYMm}mm ${labelSettings.gapXMm}mm;padding:${labelSettings.mediaType === "roll" ? 0 : labelSettings.marginMm}mm}.inventory-label-admin{padding:0!important;background:white!important}.label-sample-print>article{break-inside:avoid;page-break-inside:avoid;flex:none!important}${labelSettings.mediaType === "roll" ? ".label-sample-print>article+article{break-before:page;page-break-before:always}" : ""}}`}</style>

            {/* HEADER */}
            <div className="mb-8 flex items-center justify-between">

                <div>

                    <div
                        className="
                            mb-2
                            text-xs
                            font-black
                            uppercase
                            tracking-[0.3em]
                            text-gray-400
                        "
                    >
                        Admin / Settings
                    </div>

                    <h1
                        className="
                            text-5xl
                            font-black
                            text-gray-900
                        "
                    >
                        Inventory Setup
                    </h1>

                    <p className="mt-3 text-lg text-gray-500">

                        Configure inventory settings,
                        numbering, warehouses and RAV - Roadside Assistance Vehicle.

                    </p>

                </div>

                <button
                    type="button"
                    onClick={() => void saveActiveSettings()}
                    className="
                        flex
                        items-center
                        gap-2
                        rounded-2xl
                        bg-blue-600
                        px-8
                        py-4
                        font-black
                        text-white
                        shadow-lg
                    "
                >

                    <Save size={18} />

                    {activeTab === "labels" && labelPresetName.trim() ? "Save Template" : "Save Settings"}

                </button>

            </div>

            {/* TABS */}
            <div className="mb-8 flex flex-wrap gap-4">

                {[
                    {
                        id: "general",
                        label: "General Settings",
                    },
                    {
                        id: "units",
                        label: "Units of Measurement",
                    },
                    {
                        id: "warehouses",
                        label: "Warehouses",
                    },
                    {
                        id: "vans",
                        label: "RAV",
                    },
                    {
                        id: "labels",
                        label: "Stock Labels",
                    },
                    {
                        id: "customFields",
                        label: "Custom Fields",
                    },
                ].map((tab) => (

                    <button
                        key={tab.id}
                        onClick={() =>
                            setActiveTab(
                                tab.id as any
                            )
                        }
                        className={`
                            rounded-2xl
                            px-6
                            py-4
                            font-black
                            transition-all
                            ${activeTab === tab.id
                                ? "bg-blue-600 text-white shadow-lg"
                                : "border border-gray-300 bg-white text-gray-700"
                            }
                        `}
                    >

                        {tab.label}

                    </button>

                ))}

            </div>

            {activeTab === "labels" && <div className="label-settings-workspace grid gap-3 xl:grid-cols-[1fr_340px]">
                <section className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm">
                    <div className="mb-6"><h2 className="text-2xl font-black">Stock Label Setup</h2><p className="text-gray-500">Configure A4 label sheets or label rolls. The default is the 4BARCODE 3B-356B 40 × 30 mm roll.</p></div>
                    <div className="mb-3 grid gap-2 rounded-2xl border bg-gray-50 p-3 md:grid-cols-[1fr_1fr_auto_auto_auto]"><select value={selectedLabelPreset} onChange={(event) => loadLabelPreset(event.target.value)} className="h-10 min-w-0 rounded-lg border px-3" aria-label="Saved label setup"><option value="">New label setup</option>{savedLabelSettings && <option value="__current__">Current saved setup</option>}{labelPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select><input value={labelPresetName} onChange={(event) => setLabelPresetName(event.target.value)} placeholder="Template name" className="h-10 min-w-0 rounded-lg border px-3" /><button type="button" onClick={() => void saveLabelPreset()} className="rounded-lg bg-blue-600 px-3 font-bold text-white">{labelPresets.some((preset) => preset.id === selectedLabelPreset && preset.name.trim().toLocaleLowerCase() === labelPresetName.trim().toLocaleLowerCase()) ? "Update Template" : "Save Template"}</button><button type="button" onClick={() => { setSelectedLabelPreset(""); setLabelPresetName(""); setLabelSettings(defaultInventoryLabelSettings); }} className="rounded-lg border bg-white px-3 font-bold">New</button><button type="button" disabled={!selectedLabelPreset || selectedLabelPreset === "__current__"} onClick={() => void removeLabelPreset()} className="rounded-lg bg-red-50 px-3 font-bold text-red-700 disabled:opacity-30">Delete</button>{labelPresetError && <p className="text-xs font-bold text-red-700 md:col-span-5">{labelPresetError}</p>}</div>
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-2"><span className="text-xs font-black text-blue-950">Saved templates ({labelPresets.length}):</span>{labelPresets.length ? labelPresets.map((preset) => <button key={preset.id} type="button" onClick={() => loadLabelPreset(preset.id)} className={`rounded-lg border px-3 py-1 text-xs font-bold ${selectedLabelPreset === preset.id ? "border-blue-600 bg-blue-600 text-white" : "border-blue-200 bg-white text-blue-900"}`}>{preset.name}</button>) : <span className="text-xs text-gray-600">No named templates saved yet.</span>}</div>
                    <div className="grid gap-4 md:grid-cols-3">
                        <label className="font-bold">Media Type<select value={labelSettings.mediaType} onChange={(event) => setLabelSettings((current) => ({ ...current, mediaType: event.target.value as "roll" | "sheet" }))} className="mt-2 h-12 w-full rounded-xl border px-3"><option value="roll">Sticker Roll</option><option value="sheet">Label Sheet / A4</option></select></label>
                        <NumberSetting label="Label Width (mm)" value={labelSettings.labelWidthMm} onChange={(labelWidthMm) => setLabelSettings((current) => ({ ...current, labelWidthMm }))} />
                        <NumberSetting label="Label Height (mm)" value={labelSettings.labelHeightMm} onChange={(labelHeightMm) => setLabelSettings((current) => ({ ...current, labelHeightMm }))} />
                        <NumberSetting label="Page Width (mm)" value={labelSettings.pageWidthMm} onChange={(pageWidthMm) => setLabelSettings((current) => ({ ...current, pageWidthMm }))} disabled={labelSettings.mediaType === "roll"} />
                        <NumberSetting label="Page Height (mm)" value={labelSettings.pageHeightMm} onChange={(pageHeightMm) => setLabelSettings((current) => ({ ...current, pageHeightMm }))} disabled={labelSettings.mediaType === "roll"} />
                        <NumberSetting label="Columns" value={labelSettings.columns} onChange={(columns) => setLabelSettings((current) => ({ ...current, columns: Math.max(1, columns) }))} disabled={labelSettings.mediaType === "roll"} />
                        <NumberSetting label="Horizontal Gap (mm)" value={labelSettings.gapXMm} onChange={(gapXMm) => setLabelSettings((current) => ({ ...current, gapXMm }))} />
                        <NumberSetting label="Vertical Gap (mm)" value={labelSettings.gapYMm} onChange={(gapYMm) => setLabelSettings((current) => ({ ...current, gapYMm }))} />
                        <NumberSetting label="Margin / Padding (mm)" value={labelSettings.marginMm} onChange={(marginMm) => setLabelSettings((current) => ({ ...current, marginMm }))} />
                        <NumberSetting label="Font Size (pt)" value={labelSettings.fontSizePt} onChange={(fontSizePt) => setLabelSettings((current) => ({ ...current, fontSizePt }))} />
                    </div>
                    <label className="mt-5 flex items-center gap-2 font-bold"><input type="checkbox" checked={labelSettings.showBorder} onChange={(event) => setLabelSettings((current) => ({ ...current, showBorder: event.target.checked }))} />Print label border</label>
                    <div className="mt-6 rounded-2xl border bg-gray-50 p-4">
                        <h3 className="font-black">Label Fields</h3><p className="text-sm text-gray-500">Add fields, edit their printed captions, and move them into the required order.</p>
                        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto_1fr_auto]"><select value={labelItemField} onChange={(event) => setLabelItemField(event.target.value)} className="h-11 rounded-xl border px-3">{inventoryLabelFields.filter(([id]) => id !== "barcode").map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select><button type="button" onClick={() => { const option = inventoryLabelFields.find(([id]) => id === labelItemField); addLabelField(labelItemField, option?.[1] || labelItemField); }} className="rounded-xl bg-blue-600 px-4 font-black text-white">+ Add Item Field</button><select value={labelCustomField} onChange={(event) => setLabelCustomField(event.target.value)} className="h-11 rounded-xl border px-3"><option value="">Select custom field</option>{customFields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}</select><button type="button" disabled={!labelCustomField} onClick={() => { const field = customFields.find((entry) => entry.id === labelCustomField); if (field) addLabelField(`custom:${field.id}`, field.label); }} className="rounded-xl bg-blue-600 px-4 font-black text-white disabled:opacity-40">+ Add Custom Field</button></div>
                        <div className="mt-4 space-y-2">{(labelSettings.fields || []).map((field, index) => <div key={field.id} className="grid items-center gap-2 rounded-xl border bg-white p-2 md:grid-cols-[140px_1fr_auto_auto_auto]"><span className="truncate text-sm font-bold text-blue-700">{field.source}</span><input value={field.caption} onChange={(event) => setLabelSettings((current) => ({ ...current, fields: current.fields.map((entry) => entry.id === field.id ? { ...entry, caption: event.target.value } : entry) }))} className="h-10 rounded-lg border px-3" aria-label={`Caption for ${field.source}`} /><label className="flex items-center gap-2 whitespace-nowrap text-sm font-bold"><input type="checkbox" checked={field.showCaption !== false} onChange={(event) => setLabelSettings((current) => ({ ...current, fields: current.fields.map((entry) => entry.id === field.id ? { ...entry, showCaption: event.target.checked } : entry) }))} />Show name</label><label className="flex items-center gap-1 whitespace-nowrap text-sm font-bold">Size <input type="number" min="4" max="72" step="0.5" value={field.fontSizePt ?? labelSettings.fontSizePt} onChange={(event) => setLabelSettings((current) => ({ ...current, fields: current.fields.map((entry) => entry.id === field.id ? { ...entry, fontSizePt: Math.max(4, Number(event.target.value)) } : entry) }))} className="h-10 w-20 rounded-lg border px-2" aria-label={`Font size for ${field.source}`} /></label><div className="flex gap-1"><select value={field.align ?? "left"} onChange={(event) => setLabelSettings((current) => ({ ...current, fields: current.fields.map((entry) => entry.id === field.id ? { ...entry, align: event.target.value as "left" | "center" | "right" } : entry) }))} className="h-10 rounded-lg border px-2" aria-label={`Alignment for ${field.source}`}><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select><button type="button" onClick={() => nudgeLabelField(field.id, "x", -1)} title="Move field left 1 mm" aria-label={`Move ${field.caption} left`} className="rounded-lg border px-2 py-2">←</button><button type="button" onClick={() => nudgeLabelField(field.id, "x", 1)} title="Move field right 1 mm" aria-label={`Move ${field.caption} right`} className="rounded-lg border px-2 py-2">→</button><button type="button" onClick={() => nudgeLabelField(field.id, "y", -1)} title="Move field up 1 mm" aria-label={`Move ${field.caption} up`} className="rounded-lg border px-2 py-2">↑</button><button type="button" onClick={() => nudgeLabelField(field.id, "y", 1)} title="Move field down 1 mm" aria-label={`Move ${field.caption} down`} className="rounded-lg border px-2 py-2">↓</button><button type="button" disabled={index === 0} onClick={() => moveLabelField(index, -1)} title="Move row earlier" className="rounded-lg border px-2 py-2 disabled:opacity-25">Row ↑</button><button type="button" disabled={index === labelSettings.fields.length - 1} onClick={() => moveLabelField(index, 1)} title="Move row later" className="rounded-lg border px-2 py-2 disabled:opacity-25">Row ↓</button><button type="button" onClick={() => setLabelSettings((current) => ({ ...current, fields: current.fields.filter((entry) => entry.id !== field.id) }))} className="rounded-lg bg-red-50 px-3 py-2 font-bold text-red-700">Remove</button></div></div>)}</div>
                    </div>
                        <div className="mt-5 rounded-2xl border bg-gray-50 p-4"><h3 className="font-black">Barcode / QR Code</h3><div className="mt-3 grid gap-4 md:grid-cols-2"><label className="font-bold">Code Type<select value={labelSettings.codeType} onChange={(event) => setLabelSettings((current) => ({ ...current, codeType: event.target.value as InventoryLabelSettings["codeType"] }))} className="mt-2 h-11 w-full rounded-xl border px-3"><option value="none">No Code</option><option value="barcode">Barcode</option><option value="qr">QR Code</option></select></label><div><p className="font-bold">Fields used to create the code</p><div className="mt-2 flex flex-wrap gap-2">{[...inventoryLabelFields.filter(([id]) => id !== "barcode").map(([id, text]) => ({ id, text })), ...customFields.map((field) => ({ id: `custom:${field.id}`, text: field.label }))].map(({ id, text }) => <label key={id} className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-sm font-bold"><input type="checkbox" checked={(labelSettings.codeFields || []).includes(id)} onChange={(event) => setLabelSettings((current) => ({ ...current, codeFields: event.target.checked ? [...(current.codeFields || []), id] : (current.codeFields || []).filter((field) => field !== id) }))} />{text}</label>)}</div></div></div><div className="mt-3 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={labelSettings.showCodeText} onChange={(event) => setLabelSettings((current) => ({ ...current, showCodeText: event.target.checked }))} />Print encoded value below the code</label><label className="font-bold">Alignment <select value={labelSettings.codeAlign ?? "center"} onChange={(event) => setLabelSettings((current) => ({ ...current, codeAlign: event.target.value as "left" | "center" | "right" }))} className="ml-2 h-10 rounded-lg border px-3"><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></label><span className="font-bold">Position</span><button type="button" disabled={(labelSettings.codeOrder ?? labelSettings.fields.length) <= 0} onClick={() => setLabelSettings((current) => ({ ...current, codeOrder: Math.max(0, (current.codeOrder ?? current.fields.length) - 1) }))} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-25">↑ Up</button><button type="button" disabled={(labelSettings.codeOrder ?? labelSettings.fields.length) >= labelSettings.fields.length} onClick={() => setLabelSettings((current) => ({ ...current, codeOrder: Math.min(current.fields.length, (current.codeOrder ?? current.fields.length) + 1) }))} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-25">↓ Down</button></div></div>
                    <div className="mt-3 grid gap-3 rounded-2xl border bg-gray-50 p-4 sm:grid-cols-2 xl:grid-cols-4"><NumberSetting label="Code Width (mm)" value={labelSettings.codeWidthMm ?? 12} onChange={(codeWidthMm) => setLabelSettings((current) => ({ ...current, codeWidthMm: Math.max(4, codeWidthMm) }))} /><NumberSetting label="Code Height (mm)" value={labelSettings.codeHeightMm ?? 12} onChange={(codeHeightMm) => setLabelSettings((current) => ({ ...current, codeHeightMm: Math.max(4, codeHeightMm) }))} /><NumberSetting label="Move Left / Right (mm)" min={-100} value={labelSettings.codeOffsetXMm ?? 0} onChange={(codeOffsetXMm) => setLabelSettings((current) => ({ ...current, codeOffsetXMm }))} /><NumberSetting label="Move Up / Down (mm)" min={-100} value={labelSettings.codeOffsetYMm ?? 0} onChange={(codeOffsetYMm) => setLabelSettings((current) => ({ ...current, codeOffsetYMm }))} /><p className="text-xs text-gray-500 sm:col-span-2 xl:col-span-4">Negative values move left or up. Positive values move right or down.</p></div>
                    <div className="mt-3 grid gap-3 rounded-2xl border bg-gray-50 p-4 md:grid-cols-2"><label className="font-bold">Label Font<select value={labelSettings.fontFamily ?? defaultInventoryLabelSettings.fontFamily} onChange={(event) => setLabelSettings((current) => ({ ...current, fontFamily: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border px-3"><option value="Arial, Helvetica, sans-serif">Arial</option><option value="Verdana, Geneva, sans-serif">Verdana</option><option value="Tahoma, Geneva, sans-serif">Tahoma</option><option value="'Trebuchet MS', sans-serif">Trebuchet MS</option><option value="Georgia, serif">Georgia</option><option value="'Courier New', monospace">Courier New</option></select></label><label className="font-bold">Label Text Colour<div className="mt-2 flex h-11 items-center gap-2 rounded-xl border bg-white px-3"><input type="color" value={labelSettings.textColor ?? "#000000"} onChange={(event) => setLabelSettings((current) => ({ ...current, textColor: event.target.value }))} className="h-8 w-12 cursor-pointer border-0 p-0" /><input value={labelSettings.textColor ?? "#000000"} onChange={(event) => setLabelSettings((current) => ({ ...current, textColor: event.target.value }))} className="h-8 flex-1 border-0 px-1 font-mono" aria-label="Label text colour value" /></div></label></div>
                    <div className="mt-3 rounded-2xl border bg-gray-50 p-4"><h3 className="font-black">Per-Field Appearance</h3><p className="text-xs text-gray-500">Override the label font, text colour, and box colour for each field.</p><div className="mt-2 grid gap-2 md:grid-cols-2">{labelSettings.fields.map((field) => <div key={field.id} className="flex items-center justify-between gap-2 rounded-lg border bg-white p-2"><span className="min-w-24 truncate font-bold">{field.caption}</span><FieldStyleControls field={field} defaultFont={labelSettings.fontFamily ?? defaultInventoryLabelSettings.fontFamily ?? "Arial"} onChange={(changes) => setLabelSettings((current) => ({ ...current, fields: current.fields.map((entry) => entry.id === field.id ? { ...entry, ...changes } : entry) }))} /></div>)}</div></div>
                    <div className="mt-6 flex flex-wrap gap-3"><button type="button" disabled={!labelPresetName.trim()} onClick={() => void saveLabelPreset()} className="rounded-xl bg-emerald-600 px-6 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-40">Save Template</button><button type="button" onClick={() => void saveLabelSettings()} className="rounded-xl bg-blue-600 px-6 py-3 font-black text-white">Save Current Settings</button></div>
                </section>
                <section className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">Template Preview</h2><button type="button" onClick={() => printLabelsInCleanWindow(".label-sample-print", labelSettings.mediaType === "roll" ? labelSettings.labelWidthMm : labelSettings.pageWidthMm, labelSettings.mediaType === "roll" ? labelSettings.labelHeightMm : labelSettings.pageHeightMm, labelSettings.mediaType === "roll")} className="rounded-xl bg-blue-600 px-4 py-2 font-black text-white">Print 5 Sample Labels</button></div><div className="mt-5 flex justify-center rounded-2xl bg-gray-100 p-8"><div className="flex flex-col justify-center overflow-hidden bg-white shadow" style={{ width: `${labelSettings.labelWidthMm}mm`, height: `${labelSettings.labelHeightMm}mm`, padding: `${labelSettings.marginMm}mm`, border: labelSettings.showBorder ? "0.25mm solid #111" : "none", fontSize: `${labelSettings.fontSizePt}pt`, lineHeight: 1.15 }}>{renderSampleLabelContents()}</div></div></section>
            </div>}

            <div className="label-sample-print hidden">{Array.from({ length: 5 }, (_, index) => <article key={index} className="flex flex-col justify-center overflow-hidden bg-white" style={{ width: `${labelSettings.labelWidthMm}mm`, height: `${labelSettings.labelHeightMm}mm`, padding: `${labelSettings.marginMm}mm`, border: labelSettings.showBorder ? "0.25mm solid #111" : "none", fontSize: `${labelSettings.fontSizePt}pt`, lineHeight: 1.15 }}>{renderSampleLabelContents()}</article>)}</div>

            {/* CUSTOM FIELDS */}
            {activeTab === "customFields" && (
                <div className="space-y-8">
                    <div className="
                        rounded-[32px]
                        border
                        border-gray-200
                        bg-white
                        p-8
                        shadow-sm
                    ">
                        <div className="mb-8 flex items-center gap-3">
                            <ListPlus
                                size={28}
                                className="text-blue-600"
                            />
                            <div>
                                <h2 className="text-2xl font-black text-gray-900">
                                    Inventory Custom Fields
                                </h2>
                                <p className="text-gray-500">
                                    Add fields that users must complete on every inventory item.
                                </p>
                            </div>
                        </div>

                        <div className="
                            mb-8
                            grid
                            grid-cols-1
                            gap-4
                            rounded-3xl
                            bg-gray-50
                            p-6
                            md:grid-cols-[1fr_220px_auto_auto]
                            md:items-end
                        ">
                            <div>
                                <label className="mb-2 block text-sm font-bold text-gray-700">
                                    Field name
                                </label>
                                <input
                                    value={newFieldLabel}
                                    onChange={(event) =>
                                        setNewFieldLabel(event.target.value)
                                    }
                                    placeholder="e.g. Bin Location"
                                    className="
                                        h-14
                                        w-full
                                        rounded-2xl
                                        border-2
                                        border-gray-200
                                        bg-white
                                        px-5
                                        outline-none
                                        focus:border-blue-500
                                    "
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-bold text-gray-700">
                                    Field type
                                </label>
                                <select
                                    value={newFieldType}
                                    onChange={(event) =>
                                        setNewFieldType(
                                            event.target.value as CustomFieldType
                                        )
                                    }
                                    className="
                                        h-14
                                        w-full
                                        rounded-2xl
                                        border-2
                                        border-gray-200
                                        bg-white
                                        px-4
                                        outline-none
                                        focus:border-blue-500
                                    "
                                >
                                    <option value="text">Short text</option>
                                    <option value="textarea">Long text</option>
                                    <option value="number">Number</option>
                                    <option value="date">Date</option>
                                    <option value="time">Time</option>
                                </select>
                            </div>

                            <label className="
                                flex
                                h-14
                                cursor-pointer
                                items-center
                                gap-3
                                rounded-2xl
                                border-2
                                border-gray-200
                                bg-white
                                px-4
                                text-sm
                                font-bold
                                text-gray-700
                            ">
                                <input
                                    type="checkbox"
                                    checked={newFieldRequired}
                                    onChange={(event) =>
                                        setNewFieldRequired(event.target.checked)
                                    }
                                    className="h-5 w-5"
                                />
                                Required
                            </label>

                            <button
                                type="button"
                                onClick={addCustomField}
                                className="
                                    inline-flex
                                    h-14
                                    items-center
                                    justify-center
                                    gap-2
                                    rounded-2xl
                                    bg-blue-600
                                    px-6
                                    font-black
                                    text-white
                                    hover:bg-blue-700
                                "
                            >
                                <Plus size={18} />
                                Add Field
                            </button>
                        </div>

                        {customFields.length === 0 ? (
                            <div className="
                                rounded-2xl
                                border
                                border-dashed
                                border-gray-300
                                p-8
                                text-center
                                text-gray-500
                            ">
                                No custom fields have been added yet.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {customFields.map((field) => (
                                    <div
                                        key={field.id}
                                        className="
                                            flex
                                            items-center
                                            justify-between
                                            rounded-2xl
                                            border
                                            border-gray-200
                                            px-5
                                            py-4
                                        "
                                    >
                                        <div>
                                            <div className="font-black text-gray-900">
                                                {field.label}
                                                {field.required && (
                                                    <span className="ml-1 text-red-500">*</span>
                                                )}
                                            </div>
                                            <div className="text-sm capitalize text-gray-500">
                                                {field.type === "textarea"
                                                    ? "Long text"
                                                    : field.type}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeCustomField(field.id)}
                                            className="
                                                rounded-xl
                                                p-3
                                                text-red-500
                                                hover:bg-red-50
                                            "
                                            aria-label={`Remove ${field.label}`}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* GENERAL */}
            {activeTab === "general" && (

                <div className="space-y-8">

                    <div
                        className="
                            rounded-[32px]
                            border
                            border-gray-200
                            bg-white
                            p-8
                            shadow-sm
                        "
                    >

                        <div
                            className="
                                mb-8
                                flex
                                items-center
                                gap-3
                            "
                        >

                            <Package
                                size={28}
                                className="text-blue-600"
                            />

                            <div>

                                <div
                                    className="
                                        text-2xl
                                        font-black
                                        text-gray-900
                                    "
                                >
                                    Prefix and Numbering Settings
                                </div>

                                <div className="text-gray-500">

                                    Control how inventory
                                    record numbers are generated.

                                </div>

                            </div>

                        </div>

                        <div className="grid grid-cols-2 gap-8">

                            {/* LEFT */}
                            <div
                                className="
                                    rounded-3xl
                                    border
                                    border-gray-200
                                    bg-gray-50
                                    p-6
                                "
                            >

                                <div
                                    className="
                                        mb-6
                                        text-xl
                                        font-black
                                        text-gray-900
                                    "
                                >
                                    Prefix
                                </div>

                                <input
                                    value={inventoryPrefix}
                                    onChange={(e) =>
                                        setInventoryPrefix(
                                            e.target.value
                                        )
                                    }
                                    className="
                                        h-14
                                        w-full
                                        rounded-2xl
                                        border
                                        border-gray-300
                                        bg-white
                                        px-5
                                        font-bold
                                    "
                                />

                                <div
                                    className="
                                        mt-8
                                        text-xl
                                        font-black
                                        text-gray-900
                                    "
                                >
                                    Numbering Sequence
                                </div>

                                <div className="mt-6 grid grid-cols-2 gap-6">

                                    <div>

                                        <div
                                            className="
                                                mb-2
                                                text-sm
                                                font-bold
                                                text-gray-500
                                            "
                                        >
                                            Current Inventory Number
                                        </div>

                                        <div
                                            className="
                                                rounded-2xl
                                                bg-blue-50
                                                px-5
                                                py-4
                                                text-2xl
                                                font-black
                                                text-blue-700
                                            "
                                        >
                                            {inventoryPrefix}
                                            {currentNumber}
                                        </div>

                                    </div>

                                    <div>

                                        <div
                                            className="
                                                mb-2
                                                text-sm
                                                font-bold
                                                text-gray-500
                                            "
                                        >
                                            Next Inventory Number
                                        </div>

                                        <div
                                            className="
                                                rounded-2xl
                                                bg-green-50
                                                px-5
                                                py-4
                                                text-2xl
                                                font-black
                                                text-green-700
                                            "
                                        >
                                            {nextNumber}
                                        </div>

                                    </div>

                                </div>

                                <div className="mt-6">

                                    <div
                                        className="
                                            mb-2
                                            text-sm
                                            font-bold
                                            text-gray-500
                                        "
                                    >
                                        Set Current Number
                                    </div>

                                    <input
                                        value={currentNumber}
                                        onChange={(e) =>
                                            setCurrentNumber(
                                                e.target.value
                                            )
                                        }
                                        className="
                                            h-14
                                            w-full
                                            rounded-2xl
                                            border
                                            border-gray-300
                                            bg-white
                                            px-5
                                            font-bold
                                        "
                                    />

                                    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4">
                                        <input
                                            type="checkbox"
                                            checked={allowNegativeStock}
                                            onChange={(event) => setAllowNegativeStock(event.target.checked)}
                                            className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600"
                                        />
                                        <span>
                                            <span className="block font-black text-gray-900">Allow Stock Qty To Drop Below 0</span>
                                            <span className="mt-1 block text-sm font-medium text-gray-500">
                                                Allows every stock item to have a negative quantity when more stock is issued than is available.
                                            </span>
                                        </span>
                                    </label>

                                </div>

                            </div>

                            <div className="rounded-3xl border border-gray-200 bg-gray-50 p-6">
                                <h3 className="text-xl font-black text-gray-900">Stock Form Numbering</h3>
                                <p className="mt-1 text-sm text-gray-500">Separate prefixes and sequences for job-linked stock forms.</p>
                                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                                    <label className="font-bold text-gray-700">Parts Requisition Prefix<input value={requisitionPrefix} onChange={(event) => setRequisitionPrefix(event.target.value)} className="mt-2 h-12 w-full rounded-xl border bg-white px-4" /></label>
                                    <label className="font-bold text-gray-700">Current Requisition Number<input type="number" min="0" value={requisitionCurrentNumber} onChange={(event) => setRequisitionCurrentNumber(event.target.value)} className="mt-2 h-12 w-full rounded-xl border bg-white px-4" /></label>
                                    <label className="font-bold text-gray-700">Parts Derequisition Prefix<input value={derequisitionPrefix} onChange={(event) => setDerequisitionPrefix(event.target.value)} className="mt-2 h-12 w-full rounded-xl border bg-white px-4" /></label>
                                    <label className="font-bold text-gray-700">Current Derequisition Number<input type="number" min="0" value={derequisitionCurrentNumber} onChange={(event) => setDerequisitionCurrentNumber(event.target.value)} className="mt-2 h-12 w-full rounded-xl border bg-white px-4" /></label>
                                    <label className="font-bold text-gray-700">RAV Replenishment Prefix<input value={replenishmentPrefix} onChange={(event) => setReplenishmentPrefix(event.target.value)} className="mt-2 h-12 w-full rounded-xl border bg-white px-4" /></label>
                                    <label className="font-bold text-gray-700">Current Replenishment Number<input type="number" min="0" value={replenishmentCurrentNumber} onChange={(event) => setReplenishmentCurrentNumber(event.target.value)} className="mt-2 h-12 w-full rounded-xl border bg-white px-4" /></label>
                                </div>
                                <div className="mt-5 rounded-xl bg-white p-4 text-sm font-bold text-blue-700">Next forms: {requisitionPrefix}{String(Number(requisitionCurrentNumber || 0) + 1).padStart(4, "0")} · {derequisitionPrefix}{String(Number(derequisitionCurrentNumber || 0) + 1).padStart(4, "0")} · {replenishmentPrefix}{String(Number(replenishmentCurrentNumber || 0) + 1).padStart(4, "0")}</div>
                            </div>

                            {/* RIGHT */}
                            <div
                                className="
                                    rounded-3xl
                                    border
                                    border-blue-200
                                    bg-blue-50
                                    p-6
                                "
                            >

                                <div
                                    className="
                                        mb-4
                                        text-xl
                                        font-black
                                        text-blue-900
                                    "
                                >
                                    Hint
                                </div>

                                <ul
                                    className="
                                        space-y-3
                                        text-sm
                                        font-semibold
                                        text-blue-900
                                    "
                                >

                                    <li>
                                        • Inventory numbers
                                        automatically increment.
                                    </li>

                                    <li>
                                        • Use leading zeros if required.
                                    </li>

                                    <li>
                                        • Prefixes help separate inventory types.
                                    </li>

                                </ul>

                            </div>

                        </div>
                        <div className="mt-6 flex justify-end"><button type="button" onClick={() => void saveNumberingSettings()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-black text-white"><Save size={18} /> Save Numbering Settings</button></div>

                    </div>

                </div>

            )}

            {/* UNITS */}
            {activeTab === "units" && (

                <div
                    className="
                        rounded-[32px]
                        border
                        border-gray-200
                        bg-white
                        p-8
                        shadow-sm
                    "
                >

                    <div
                        className="
                            mb-8
                            flex
                            items-center
                            justify-between
                        "
                    >

                        <div
                            className="
                                flex
                                items-center
                                gap-3
                            "
                        >

                            <Ruler
                                size={28}
                                className="text-blue-600"
                            />

                            <div
                                className="
                                    text-2xl
                                    font-black
                                    text-gray-900
                                "
                            >
                                Units of Measurement
                            </div>

                        </div>

                        <div className="flex gap-3">

                            <input
                                value={newUnit}
                                onChange={(e) =>
                                    setNewUnit(
                                        e.target.value
                                    )
                                }
                                placeholder="New Unit"
                                className="
                                    h-14
                                    rounded-2xl
                                    border
                                    border-gray-300
                                    px-5
                                "
                            />

                            <button
                                onClick={() => {

                                    if (!newUnit) return;

                                    setUnits([
                                        ...units,
                                        newUnit,
                                    ]);

                                    setNewUnit("");

                                }}
                                className="
                                    flex
                                    items-center
                                    gap-2
                                    rounded-2xl
                                    bg-blue-600
                                    px-6
                                    py-4
                                    font-black
                                    text-white
                                "
                            >

                                <Plus size={18} />

                                Add

                            </button>

                        </div>

                    </div>

                    <div className="space-y-4">

                        {units.map((unit, index) => (

                            <div
                                key={index}
                                className="
                                    flex
                                    items-center
                                    justify-between
                                    rounded-2xl
                                    border
                                    border-gray-200
                                    bg-gray-50
                                    px-6
                                    py-5
                                "
                            >

                                <div
                                    className="
                                        text-lg
                                        font-black
                                        text-gray-900
                                    "
                                >
                                    {unit}
                                </div>

                                <button
                                    onClick={() =>
                                        setUnits(
                                            units.filter(
                                                (_, i) =>
                                                    i !== index
                                            )
                                        )
                                    }
                                    className="
                                        rounded-xl
                                        bg-red-50
                                        p-3
                                        text-red-600
                                    "
                                >

                                    <Trash2 size={18} />

                                </button>

                            </div>

                        ))}

                    </div>

                </div>

            )}

            {/* WAREHOUSES */}
            {activeTab === "warehouses" && (

                <div
                    className="
                        rounded-[32px]
                        border
                        border-gray-200
                        bg-white
                        p-8
                        shadow-sm
                    "
                >

                    <div
                        className="
                            mb-8
                            flex
                            items-center
                            justify-between
                        "
                    >

                        <div
                            className="
                                flex
                                items-center
                                gap-3
                            "
                        >

                            <Warehouse
                                size={28}
                                className="text-blue-600"
                            />

                            <div
                                className="
                                    text-2xl
                                    font-black
                                    text-gray-900
                                "
                            >
                                Warehouses
                            </div>

                        </div>

                        <div className="flex gap-3">

                            <input
                                value={newWarehouse}
                                onChange={(e) =>
                                    setNewWarehouse(
                                        e.target.value
                                    )
                                }
                                placeholder="Warehouse Name"
                                className="
                                    h-14
                                    rounded-2xl
                                    border
                                    border-gray-300
                                    px-5
                                "
                            />

                            <button

                                onClick={async () => {

                                    try {

                                        if (!newWarehouse.trim()) {
                                            alert("Enter warehouse name");
                                            return;
                                        }


                                        await addDoc(

                                            collection(
                                                clientDb,
                                                "companies",
                                                COMPANY_ID,
                                                "inventory_settings",
                                                "setup",
                                                "warehouses"
                                            ),

                                            {

                                                name: newWarehouse.trim(),

                                                active: true,

                                                createdAt:
                                                    serverTimestamp()

                                            }

                                        );


                                        setNewWarehouse("");


                                        await loadInventorySettings();


                                        alert("Warehouse Added");


                                    }
                                    catch (error) {

                                        console.error(error);

                                        alert("Failed to add warehouse");

                                    }

                                }}

                                className="
rounded-2xl
bg-blue-600
px-6
py-4
font-black
text-white
"
                            >

                                Add Warehouse

                            </button>

                        </div>

                    </div>

                    <div className="space-y-4">

                        {warehouses.map(
                            (warehouse) => (

                                <div
                                    key={warehouse.id}
                                    className="
                                        flex
                                        items-center
                                        justify-between
                                        rounded-2xl
                                        border
                                        border-gray-200
                                        bg-gray-50
                                        px-6
                                        py-5
                                    "
                                >

                                    <div className="min-w-0 flex-1 text-lg font-black text-gray-900">
                                        {editingWarehouseId === warehouse.id ? <input autoFocus value={editingWarehouseName} onChange={(event) => setEditingWarehouseName(event.target.value)} className="h-12 w-full max-w-xl rounded-xl border border-blue-300 bg-white px-4 outline-none focus:ring-2 focus:ring-blue-100" /> : <div className="flex flex-wrap items-center gap-2"><span>{warehouse.name}</span>{warehouse.id === "MAIN" && <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">MAIN · Primary Warehouse</span>}</div>}

                                        <div
                                            className={`
        mt-2
        inline-flex
        rounded-full
        px-3
        py-1
        text-xs
        font-black
        ${warehouse.active
                                                    ? "bg-green-100 text-green-700"
                                                    : "bg-red-100 text-red-700"
                                                }
    `}
                                        >

                                            {warehouse.active
                                                ? "Active"
                                                : "Inactive"}

                                        </div>
                                    </div>

                                    <div className="ml-4 flex items-center gap-2">
                                    {editingWarehouseId === warehouse.id ? <><button type="button" onClick={() => { setEditingWarehouseId(null); setEditingWarehouseName(""); }} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold">Cancel</button><button type="button" onClick={async () => {
                                        const name = editingWarehouseName.trim();
                                        if (!name) return alert("Enter the warehouse name.");
                                        await updateDoc(doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "setup", "warehouses", warehouse.id), { name, updatedAt: serverTimestamp() });
                                        setEditingWarehouseId(null);
                                        setEditingWarehouseName("");
                                        await loadInventorySettings();
                                    }} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white"><Save size={17} className="mr-2 inline" />Save</button></> : <button type="button" onClick={() => { setEditingWarehouseId(warehouse.id); setEditingWarehouseName(String(warehouse.name || "")); }} className="rounded-xl bg-blue-50 p-3 text-blue-700" title={`Edit ${warehouse.name}`}><Pencil size={18} /></button>}

                                    {warehouse.id !== "MAIN" && <button
                                        onClick={async () => {

                                            await deleteDoc(

                                                doc(
                                                    clientDb,
                                                    "companies",
                                                    COMPANY_ID,
                                                    "inventory_settings",
                                                    "setup",
                                                    "warehouses",
                                                    warehouse.id
                                                )

                                            );


                                            await loadInventorySettings();


                                        }}

                                        className="
rounded-xl
bg-red-50
p-3
text-red-600
"
                                    >

                                        <Trash2 size={18} />

                                    </button>}
                                    </div>

                                </div>

                            )
                        )}

                    </div>

                </div>

            )}

            {/* RAV`s */}
            {activeTab === "vans" && (

                <div
                    className="
                        rounded-[32px]
                        border
                        border-gray-200
                        bg-white
                        p-8
                        shadow-sm
                    "
                >

                    <div
                        className="
                            mb-8
                            flex
                            items-center
                            justify-between
                        "
                    >

                        <div
                            className="
                                flex
                                items-center
                                gap-3
                            "
                        >

                            <Truck
                                size={28}
                                className="text-blue-600"
                            />

                            <div
                                className="
                                    text-2xl
                                    font-black
                                    text-gray-900
                                "
                            >
                                RAV`s - Roadside Assistance Vehicles
                            </div>

                        </div>

                        <div className="flex gap-3">

                            <input
                                value={newVan}
                                onChange={(e) =>
                                    setNewVan(
                                        e.target.value
                                    )
                                }
                                placeholder="RAV Name"
                                className="
                                    h-14
                                    rounded-2xl
                                    border
                                    border-gray-300
                                    px-5
                                "
                            />

                            <button

                                onClick={async () => {

                                    try {


                                        if (!newVan.trim()) {

                                            alert("Enter RAV name");

                                            return;

                                        }


                                        await addDoc(

                                            collection(
                                                clientDb,
                                                "companies",
                                                COMPANY_ID,
                                                "inventory_settings",
                                                "setup",
                                                "rav"
                                            ),

                                            {

                                                name:
                                                    newVan.trim(),


                                                assignedUserId:
                                                    "",


                                                assignedUserName:
                                                    "",


                                                active:
                                                    true,

                                                autoReplenishment:
                                                    false,


                                                createdAt:
                                                    serverTimestamp()

                                            }

                                        );


                                        setNewVan("");


                                        await loadInventorySettings();


                                        alert("RAV Added");


                                    }
                                    catch (error) {

                                        console.error(error);

                                        alert("Failed to add RAV");

                                    }

                                }}

                                className="
rounded-2xl
bg-blue-600
px-6
py-4
font-black
text-white
"
                            >

                                Add RAV

                            </button>

                        </div>

                    </div>

                    <div className="space-y-4">

                        {vans.map((van, index) => (

                            <div
                                key={van.id}
                                className="
                                    flex
                                    items-center
                                    justify-between
                                    rounded-2xl
                                    border
                                    border-gray-200
                                    bg-gray-50
                                    px-6
                                    py-5
                                "
                            >

                                <div>

                                    <div className="flex items-center gap-3">

                                        {editingVanId === van.id ? (

                                            <input
                                                value={editingVanName}
                                                onChange={(e) =>
                                                    setEditingVanName(
                                                        e.target.value
                                                    )
                                                }
                                                className="
                h-12
                rounded-xl
                border
                border-blue-300
                bg-white
                px-4
                text-lg
                font-black
                text-gray-900
            "
                                            />

                                        ) : (

                                            <div
                                                className="
                text-lg
                font-black
                text-gray-900
            "
                                            >
                                                {van.name}
                                            </div>

                                        )}

                                        <button

                                            onClick={async () => {


                                                const hasInventory =
                                                    inventoryItems.some(
                                                        (item) =>
                                                            item.linkedVanId === van.id
                                                    );


                                                if (
                                                    van.active &&
                                                    hasInventory
                                                ) {

                                                    alert(
                                                        "This RAV cannot be deactivated because inventory items are linked to it."
                                                    );

                                                    return;

                                                }


                                                await updateDoc(

                                                    doc(
                                                        clientDb,
                                                        "companies",
                                                        COMPANY_ID,
                                                        "inventory_settings",
                                                        "setup",
                                                        "rav",
                                                        van.id
                                                    ),

                                                    {

                                                        active:
                                                            !van.active,

                                                        updatedAt:
                                                            serverTimestamp()

                                                    }

                                                );


                                                await loadInventorySettings();


                                            }}

                                            className={`
rounded-xl
px-4
py-3
text-sm
font-black
transition-all
${van.active
                                                    ? "bg-red-50 text-red-600"
                                                    : "bg-green-50 text-green-700"
                                                }
`}
                                        >

                                            {van.active
                                                ? "Deactivate"
                                                : "Activate"}

                                        </button>

                                    </div>

                                    <div className="mt-4">

                                        <div
                                            className="
                mb-2
                text-xs
                font-black
                uppercase
                tracking-wide
                text-gray-500
            "
                                        >
                                            Assigned User
                                        </div>

                                        <select
                                            value={van.assignedUserName || ""}
                                            onChange={async (e) => {


                                                await updateDoc(

                                                    doc(
                                                        clientDb,
                                                        "companies",
                                                        COMPANY_ID,
                                                        "inventory_settings",
                                                        "setup",
                                                        "rav",
                                                        van.id
                                                    ),

                                                    {

                                                        assignedUserName:
                                                            e.target.value,

                                                        updatedAt:
                                                            serverTimestamp()

                                                    }

                                                );


                                                await loadInventorySettings();


                                            }}
                                            className="
                h-12
                rounded-xl
                border
                border-gray-300
                bg-white
                px-4
                text-sm
                font-bold
            "
                                        >

                                            <option value="">
                                                No User Assigned
                                            </option>

                                            {users.map((user) => (

                                                <option
                                                    key={user}
                                                    value={user}
                                                >

                                                    {user}

                                                </option>

                                            ))}

                                        </select>

                                    </div>

                                    <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-950">
                                        <input type="checkbox" checked={van.autoReplenishment === true} onChange={async (event) => {
                                            await updateDoc(doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "setup", "rav", van.id), { autoReplenishment: event.target.checked, updatedAt: serverTimestamp() });
                                            await loadInventorySettings();
                                        }} className="h-5 w-5 accent-blue-600" />
                                        Automatically create a replenishment slip when stock from this RAV is used on a job
                                    </label>

                                    <div
                                        className={`
            mt-4
            inline-flex
            rounded-full
            px-3
            py-1
            text-xs
            font-black
            ${van.active
                                                ? "bg-green-100 text-green-700"
                                                : "bg-red-100 text-red-700"
                                            }
        `}
                                    >

                                        {van.active
                                            ? "Active"
                                            : "Inactive"}

                                    </div>

                                </div>


                            </div>

                        ))}

                    </div>

                </div>

            )}

        </div>

    );

}
