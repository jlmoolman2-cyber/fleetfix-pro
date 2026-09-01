"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";

import { clientDb, storage } from "@/lib/firebaseClient";
import { creationAuditFields } from "@/lib/audit";

import {
  useEffect,
  useState,
} from "react";

import {
  onSnapshot,
} from "firebase/firestore";

interface DropdownItem {
  id: string;
  name: string;
}

interface CustomFieldDefinition {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "time" | "textarea";
  required: boolean;
}

interface SelectedImage {
  file: File;
  previewUrl: string;
}

export default function NewInventoryPage() {

  const router = useRouter();

  const [saving, setSaving] =
    useState(false);

  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [imageError, setImageError] = useState("");

  const [categories, setCategories] =
    useState<DropdownItem[]>([]);

  const [brands, setBrands] =
    useState<DropdownItem[]>([]);

  const [units, setUnits] =
    useState<DropdownItem[]>([]);

  const [binLocations, setBinLocations] =
    useState<DropdownItem[]>([]);

  const [customFieldDefinitions, setCustomFieldDefinitions] =
    useState<CustomFieldDefinition[]>([]);

  const [form, setForm] =
    useState({

      partNumber: "",

      stockItemType: "Parts",

      markupPercent: 0,

      description: "",

      crossReferences: "",

      category: "",

      brand: "",

      unit: "",

      barcode: "",

      costPrice: 0.00,

      sellPrice: 0.00,

      quantityTracking: true,

      serialNumberTracking: false,

      customFields: {} as Record<string, string | number>,

      warehouseStock: {
        MAIN: 0,
        "001_NVTS_L": 0,
        "002_NVTS_L": 0,
        "003_NVTS_L": 0,
        "005_NVTS_L": 0,
        GRB_004_COMBINED: 0,
        POWERSTAR: 0,
      },
    });

  useEffect(() => {

    const unsubCategories =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          "comp_001",
          "inventory_categories"
        ),

        (snapshot) => {

          setCategories(
            snapshot.docs.map((doc) => ({
              id: doc.id,
              name:
                doc.data().name || "",
            }))
          );
        }
      );

    const unsubBrands =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          "comp_001",
          "inventory_brands"
        ),

        (snapshot) => {

          setBrands(
            snapshot.docs.map((doc) => ({
              id: doc.id,
              name:
                doc.data().name || "",
            }))
          );
        }
      );

    const unsubUnits =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          "comp_001",
          "inventory_units"
        ),

        (snapshot) => {

          setUnits(
            snapshot.docs.map((doc) => ({
              id: doc.id,
              name:
                doc.data().name || "",
            }))
          );
        }
      );

    const unsubBinLocations =
      onSnapshot(
        collection(
          clientDb,
          "companies",
          "comp_001",
          "inventory_bin_locations"
        ),
        (snapshot) => {
          setBinLocations(
            snapshot.docs.map((optionDoc) => ({
              id: optionDoc.id,
              name: String(optionDoc.data().name || ""),
            }))
          );
        }
      );

    const unsubCustomFields =
      onSnapshot(
        collection(
          clientDb,
          "companies",
          "comp_001",
          "inventory_settings",
          "setup",
          "custom_fields"
        ),
        (snapshot) => {
          setCustomFieldDefinitions(
            snapshot.docs.map((fieldDoc) => ({
              id: fieldDoc.id,
              label: String(fieldDoc.data().label || ""),
              type: (fieldDoc.data().type || "text") as
                CustomFieldDefinition["type"],
              required: Boolean(fieldDoc.data().required),
            }))
          );
        }
      );

    return () => {
      unsubCategories();
      unsubBrands();
      unsubUnits();
      unsubBinLocations();
      unsubCustomFields();
    };

  }, []);

  async function createCategory(
    categoryName: string
  ) {

    await setDoc(

      doc(
        clientDb,
        "companies",
        "comp_001",
        "inventory_categories",
        categoryName
      ),

      {
        name: categoryName,
        active: true,
      }
    );
  }

  async function createBrand(
    brandName: string
  ) {

    await setDoc(

      doc(
        clientDb,
        "companies",
        "comp_001",
        "inventory_brands",
        brandName
      ),

      {
        name: brandName,
        active: true,
      }
    );
  }

  async function createUnit(
    unitName: string
  ) {

    await setDoc(

      doc(
        clientDb,
        "companies",
        "comp_001",
        "inventory_units",
        unitName
      ),

      {
        name: unitName,
        active: true,
      }
    );
  }

  async function createBinLocation(
    binLocationName: string
  ) {
    await setDoc(
      doc(
        clientDb,
        "companies",
        "comp_001",
        "inventory_bin_locations",
        binLocationName
      ),
      {
        name: binLocationName,
        active: true,
      },
      { merge: true }
    );
  }

  async function saveInventory() {

    try {

      const missingRequiredField =
        customFieldDefinitions.find((field) => {
          if (!field.required) return false;

          const value = form.customFields[field.id];
          return value === undefined || String(value).trim() === "";
        });

      if (missingRequiredField) {
        alert(`${missingRequiredField.label} is required`);
        return;
      }

      setSaving(true);

      const warehouseTotal =
        form.warehouseStock.MAIN;

      const vanTotal =
        form.warehouseStock[
        "001_NVTS_L"
        ] +

        form.warehouseStock[
        "002_NVTS_L"
        ] +

        form.warehouseStock[
        "003_NVTS_L"
        ] +

        form.warehouseStock[
        "005_NVTS_L"
        ] +

        form.warehouseStock[
        "GRB_004_COMBINED"
        ] +

        form.warehouseStock[
        "POWERSTAR"
        ];

      const grandTotal =
        warehouseTotal + vanTotal;

      const inventoryRef = doc(
        collection(
          clientDb,
          "companies",
          "comp_001",
          "inventory"
        )
      );

      const imageUrls = await Promise.all(selectedImages.map(async ({ file }) => {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const fileRef = storageRef(storage, `companies/comp_001/inventory/${inventoryRef.id}/${crypto.randomUUID()}-${safeName}`);
        await uploadBytes(fileRef, file, { contentType: file.type });
        return getDownloadURL(fileRef);
      }));

      await setDoc(

        inventoryRef,

        {
          ...form,

          warehouseTotal,

          vanTotal,

          grandTotal,

          imageUrls,

          imageUrl: imageUrls[0] || "",

          qrCodeUrl:
            `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${form.partNumber}`,

          isActive: true,

          ...creationAuditFields(),
        }
      );

      router.replace("/inventory");

    } catch (error) {

      console.error(error);

      alert(
        "Failed to save inventory"
      );

    } finally {

      setSaving(false);

    }
  }

  function selectImages(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    setImageError("");

    const invalidFile = files.find((file) => !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024);
    if (invalidFile) {
      setImageError("Use image files no larger than 5 MB each.");
      return;
    }
    if (selectedImages.length + files.length > 5) {
      setImageError("A maximum of 5 images can be added to an item.");
      return;
    }

    setSelectedImages((current) => [...current, ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }

  function removeImage(index: number) {
    setSelectedImages((current) => {
      URL.revokeObjectURL(current[index].previewUrl);
      return current.filter((_, imageIndex) => imageIndex !== index);
    });
    setImageError("");
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="max-w-[1400px] mx-auto">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">

          <div>

            <div className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold mb-2">
              Inventory
            </div>

            <h1 className="text-4xl font-black text-gray-900">
              Add Inventory Item
            </h1>

          </div>

          <Link
            href="/inventory"
            className="
              bg-gray-200
              hover:bg-gray-300
              px-5
              h-12
              rounded-2xl
              inline-flex
              items-center
              text-sm
              font-bold
            "
          >
            Back
          </Link>

        </div>

        {/* FORM */}
        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* PART NUMBER */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Part Number
              </label>

              <input
                type="text"
                value={form.partNumber}
                onChange={(e) =>
                  setForm({
                    ...form,
                    partNumber:
                      e.target.value,
                  })
                }
                className="
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                  outline-none
                  focus:border-blue-500
                "
              />

            </div>

            {/* STOCK ITEM TYPE */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Stock Item Type *
              </label>

              <select
                value={form.stockItemType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    stockItemType:
                      e.target.value,
                  })
                }
                className="
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                  outline-none
                  focus:border-blue-500
                "
              >

                <option value="Parts">
                  Parts
                </option>

                <option value="Product">
                  Product
                </option>

                <option value="Service">
                  Service
                </option>

              </select>

            </div>

            {/* DESCRIPTION */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Description
              </label>

              <input
                type="text"
                value={form.description}
                onChange={(e) =>
                  setForm({
                    ...form,
                    description:
                      e.target.value,
                  })
                }
                className="
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                  outline-none
                  focus:border-blue-500
                "
              />

            </div>

            {/* CATEGORY */}
            <div className="lg:col-span-2">

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Cross References
              </label>

              <input
                type="text"
                value={form.crossReferences}
                onChange={(event) =>
                  setForm({
                    ...form,
                    crossReferences: event.target.value,
                  })
                }
                placeholder="Enter numbers, text, or a combination"
                className="
                  h-14
                  w-full
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                  outline-none
                  focus:border-blue-500
                "
              />

            </div>

            <section className="rounded-3xl border border-gray-200 bg-gray-50 p-6 lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-gray-900">Item Images</h2>
                  <p className="mt-1 text-sm text-gray-500">Add up to 5 images. Maximum size: 5 MB per image.</p>
                </div>
                <label className={`inline-flex h-12 cursor-pointer items-center rounded-xl px-5 text-sm font-black transition ${selectedImages.length >= 5 ? "cursor-not-allowed bg-gray-200 text-gray-400" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
                  {selectedImages.length ? "Add More Images" : "Choose Images"}
                  <input data-ignore-dirty="true" type="file" accept="image/*" multiple disabled={selectedImages.length >= 5 || saving} onChange={selectImages} className="sr-only" />
                </label>
              </div>

              {imageError && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{imageError}</p>}

              {selectedImages.length > 0 ? <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {selectedImages.map((image, index) => <div key={image.previewUrl} className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  <img src={image.previewUrl} alt={`Item preview ${index + 1}`} className="aspect-square w-full object-cover" />
                  {index === 0 && <span className="absolute left-2 top-2 rounded-full bg-blue-600 px-2 py-1 text-[10px] font-black uppercase text-white">Primary</span>}
                  <button type="button" onClick={() => removeImage(index)} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-lg font-black text-red-600 shadow" aria-label={`Remove image ${index + 1}`}>×</button>
                </div>)}
              </div> : <div className="mt-5 flex min-h-32 items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-white text-sm font-bold text-gray-400">No item images selected</div>}

              <p className="mt-3 text-right text-xs font-bold text-gray-500">{selectedImages.length} / 5 images</p>
            </section>

            <div className="
              mt-2
              rounded-3xl
              border
              border-gray-200
              bg-gray-50
              p-6
              lg:col-start-1
              lg:row-start-5
            ">
              <h2 className="mb-5 text-xl font-black text-gray-900">
                Information
              </h2>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

            {/* CATEGORY */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Category
              </label>

              <select
                value={form.category}
                onChange={async (e) => {

                  if (
                    e.target.value ===
                    "ADD_NEW"
                  ) {

                    const newCategory =
                      prompt(
                        "Enter new category"
                      );

                    if (newCategory) {

                      await createCategory(
                        newCategory
                      );

                      setForm({
                        ...form,
                        category:
                          newCategory,
                      });
                    }

                    return;
                  }

                  setForm({
                    ...form,
                    category:
                      e.target.value,
                  });

                }}
                className="
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                  outline-none
                  focus:border-blue-500
                "
              >

                <option value="">
                  Select Category
                </option>

                <option value="ADD_NEW">
                  + Add New Category
                </option>

                {categories.map(
                  (category) => (

                    <option
                      key={
                        category.id
                      }
                      value={
                        category.name
                      }
                    >
                      {category.name}
                    </option>
                  )
                )}

              </select>

            </div>

            {/* BRAND */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Brand
              </label>

              <select
                value={form.brand}
                onChange={async (e) => {

                  if (
                    e.target.value ===
                    "ADD_NEW"
                  ) {

                    const newBrand =
                      prompt(
                        "Enter new brand"
                      );

                    if (newBrand) {

                      await createBrand(
                        newBrand
                      );

                      setForm({
                        ...form,
                        brand:
                          newBrand,
                      });
                    }

                    return;
                  }

                  setForm({
                    ...form,
                    brand:
                      e.target.value,
                  });

                }}
                className="
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                  outline-none
                  focus:border-blue-500
                "
              >

                <option value="">
                  Select Brand
                </option>

                <option value="ADD_NEW">
                  + Add New Brand
                </option>

                {brands.map(
                  (brand) => (

                    <option
                      key={
                        brand.id
                      }
                      value={
                        brand.name
                      }
                    >
                      {brand.name}
                    </option>
                  )
                )}

              </select>

            </div>

            {customFieldDefinitions.map((field) => {
              const value = form.customFields[field.id] ?? "";
              const isBinLocation =
                field.label
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9]/g, "") === "binlocation";

              if (isBinLocation) {
                return (
                  <div key={field.id}>
                    <label className="mb-2 block text-sm font-bold text-gray-700">
                      {field.label}
                      {field.required && (
                        <span className="ml-1 text-red-500">*</span>
                      )}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        list={`new-custom-field-${field.id}-options`}
                        value={String(value)}
                        required={field.required}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            customFields: {
                              ...form.customFields,
                              [field.id]: event.target.value,
                            },
                          })
                        }
                        placeholder="Search or select bin location"
                        className="
                          h-14
                          min-w-0
                          flex-1
                          rounded-2xl
                          border-2
                          border-gray-200
                          bg-white
                          px-5
                          outline-none
                          focus:border-blue-500
                        "
                      />
                      <datalist id={`new-custom-field-${field.id}-options`}>
                        {binLocations.map((location) => (
                          <option key={location.id} value={location.name} />
                        ))}
                      </datalist>
                      <button
                        type="button"
                        onClick={async () => {
                          const enteredName =
                            prompt("Enter new bin location");
                          const name = enteredName?.trim();

                          if (!name) return;

                          await createBinLocation(name);
                          setForm({
                            ...form,
                            customFields: {
                              ...form.customFields,
                              [field.id]: name,
                            },
                          });
                        }}
                        className="
                          h-14
                          shrink-0
                          rounded-2xl
                          border-2
                          border-blue-200
                          bg-blue-50
                          px-4
                          text-sm
                          font-black
                          text-blue-700
                          hover:bg-blue-100
                        "
                      >
                        + Add New
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={field.id}
                  className={
                    field.type === "textarea"
                      ? "lg:col-span-2"
                      : undefined
                  }
                >
                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    {field.label}
                    {field.required && (
                      <span className="ml-1 text-red-500">*</span>
                    )}
                  </label>
                  {field.type === "textarea" ? (
                    <textarea
                      value={value}
                      required={field.required}
                      rows={4}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          customFields: {
                            ...form.customFields,
                            [field.id]: event.target.value,
                          },
                        })
                      }
                      className="
                        w-full
                        rounded-2xl
                        border-2
                        border-gray-200
                        bg-white
                        px-5
                        py-4
                        outline-none
                        focus:border-blue-500
                      "
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={value}
                      required={field.required}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          customFields: {
                            ...form.customFields,
                            [field.id]:
                              field.type === "number" &&
                              event.target.value !== ""
                                ? Number(event.target.value)
                                : event.target.value,
                          },
                        })
                      }
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
                  )}
                </div>
              );
            })}

              </div>
            </div>

            <div className="
              space-y-5
              rounded-3xl
              border
              border-gray-200
              bg-gray-50
              p-6
              lg:col-start-1
              lg:row-start-6
            ">
              <h2 className="text-xl font-black text-gray-900">
                Item Details
              </h2>

            {/* UNIT */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Unit
              </label>

              <select
                value={form.unit}
                onChange={async (e) => {

                  if (
                    e.target.value ===
                    "ADD_NEW"
                  ) {

                    const newUnit =
                      prompt(
                        "Enter new unit"
                      );

                    if (newUnit) {

                      await createUnit(
                        newUnit
                      );

                      setForm({
                        ...form,
                        unit:
                          newUnit,
                      });
                    }

                    return;
                  }

                  setForm({
                    ...form,
                    unit:
                      e.target.value,
                  });

                }}
                className="
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                  outline-none
                  focus:border-blue-500
                "
              >

                <option value="">
                  Select Unit
                </option>

                <option value="ADD_NEW">
                  + Add New Unit
                </option>

                {units.map(
                  (unit) => (

                    <option
                      key={
                        unit.id
                      }
                      value={
                        unit.name
                      }
                    >
                      {unit.name}
                    </option>
                  )
                )}

              </select>

            </div>

            {/* BARCODE */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Barcode
              </label>

              <input
                type="text"
                value={form.barcode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    barcode:
                      e.target.value,
                  })
                }
                className="
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                  outline-none
                  focus:border-blue-500
                "
              />

            </div>

            </div>

            {/* COST PRICE */}
            <div className="
              space-y-5
              rounded-3xl
              border
              border-gray-200
              bg-gray-50
              p-6
              lg:col-start-2
              lg:row-start-5
            ">
              <h2 className="text-xl font-black text-gray-900">
                Pricing (Excluding VAT)
              </h2>

            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Cost Price
              </label>

              <input
                type="number"
                step="0.01"
                value={form.costPrice}
                onChange={(e) => {
                  const costPrice = Number(e.target.value);

                  setForm({
                    ...form,
                    costPrice,
                    sellPrice: Number(
                      (
                        costPrice *
                        (1 + form.markupPercent / 100)
                      ).toFixed(2)
                    ),
                  });
                }}
                className="
                  appearance-none
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                  outline-none
                  focus:border-blue-500
                "
              />

              <div className="text-xs text-gray-400 mt-2">
                Excluding 15% VAT
              </div>

            </div>

            {/* MARKUP */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Markup %
              </label>

              <input
                type="number"
                step="0.01"
                value={form.markupPercent}
                onChange={(e) => {

                  const markup =
                    Number(e.target.value);

                  const sellPrice =

                    form.costPrice +

                    (
                      form.costPrice *
                      (markup / 100)
                    );

                  setForm({
                    ...form,

                    markupPercent:
                      markup,

                    sellPrice:
                      Number(
                        sellPrice.toFixed(2)
                      ),
                  });
                }}
                className="
                  appearance-none
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                  outline-none
                  focus:border-blue-500
                "
              />

            </div>

            {/* SELL PRICE */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Sell Price
              </label>

              <input
                type="number"
                step="0.01"
                value={form.sellPrice}
                onChange={(e) => {
                  const sellPrice = Number(e.target.value);

                  setForm({
                    ...form,
                    sellPrice,
                    markupPercent:
                      form.costPrice > 0
                        ? Number(
                            (
                              ((sellPrice - form.costPrice) /
                                form.costPrice) *
                              100
                            ).toFixed(2)
                          )
                        : form.markupPercent,
                  });
                }}
                className="
                  appearance-none
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                  outline-none
                  focus:border-blue-500
                "
              />

              <div className="text-xs text-gray-400 mt-2">
                Excluding 15% VAT
              </div>

            </div>

            </div>

          </div>

          {/* STOCK NOTICE */}
          <div className="mt-10">

            <label className="mb-5 flex cursor-pointer items-center gap-3 rounded-2xl border border-gray-200 bg-white p-5 font-bold text-gray-800">
              <input type="checkbox" checked={form.serialNumberTracking} onChange={(event) => setForm({ ...form, serialNumberTracking: event.target.checked })} className="h-5 w-5 accent-blue-600" />
              Track individual serial numbers for this item
            </label>

            <div className="
    bg-amber-50
    border
    border-amber-200
    rounded-3xl
    p-6
  ">

              <div className="text-lg font-black text-amber-900 mb-3">
                Stock Control
              </div>

              <div className="space-y-2 text-sm text-amber-800">

                <div>
                  • New inventory items start with ZERO stock.
                </div>

                <div>
                  • Stock quantities can ONLY change via:
                </div>

                <div className="pl-4">
                  - GRV (Goods Received Voucher)
                </div>

                <div className="pl-4">
                  - Stock Adjustment
                </div>

                <div className="pl-4">
                  - Job Material Usage
                </div>

              </div>

            </div>

          </div>

          {/* SAVE */}

          {/* SAVE */}
          <div className="flex justify-end mt-10">

            <button
              onClick={saveInventory}
              disabled={saving}
              className="
                bg-blue-600
                hover:bg-blue-700
                disabled:opacity-50
                text-white
                px-8
                h-14
                rounded-2xl
                text-sm
                font-black
                transition
              "
            >
              {saving
                ? "Saving..."
                : "Save Inventory"}
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}
