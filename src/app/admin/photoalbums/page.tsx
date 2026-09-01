"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";

type JobType = { id: string; name: string; active?: boolean };
type PhotoItem = { id: string; name: string; minimumPhotos: number; required: boolean };
type Category = { id: string; name: string; lockWhenComplete: boolean; photoItems: PhotoItem[] };
type Album = {
  id: string;
  name: string;
  jobTypeIds?: string[];
  jobTypeNames?: string[];
  jobTypeId?: string;
  jobTypeName?: string;
  active: boolean;
  categories: Category[];
};

const uid = () => crypto.randomUUID();
const newPhotoItem = (): PhotoItem => ({ id: uid(), name: "", minimumPhotos: 1, required: true });
const newCategory = (): Category => ({ id: uid(), name: "", lockWhenComplete: true, photoItems: [newPhotoItem()] });
const getJobTypeIds = (album: Album) => album.jobTypeIds?.length ? album.jobTypeIds : album.jobTypeId ? [album.jobTypeId] : [];
const getJobTypeNames = (album: Album) => album.jobTypeNames?.length ? album.jobTypeNames : album.jobTypeName ? [album.jobTypeName] : [];

export default function PhotoAlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [name, setName] = useState("");
  const [jobTypeIds, setJobTypeIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [categories, setCategories] = useState<Category[]>([newCategory()]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => onSnapshot(
    collection(clientDb, "companies", COMPANY_ID, "photoAlbumTemplates"),
    (snapshot) => setAlbums(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Album, "id">) }))),
    (error) => console.error("Unable to load photo albums", error),
  ), []);

  useEffect(() => onSnapshot(
    collection(clientDb, "companies", COMPANY_ID, "jobTypes"),
    (snapshot) => setJobTypes(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<JobType, "id">) })).sort((a, b) => a.name.localeCompare(b.name))),
    (error) => console.error("Unable to load job types", error),
  ), []);

  const filteredAlbums = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...albums].sort((a, b) => a.name.localeCompare(b.name)).filter((album) =>
      !term || album.name.toLowerCase().includes(term) || getJobTypeNames(album).some((jobTypeName) => jobTypeName.toLowerCase().includes(term)));
  }, [albums, search]);

  function resetEditor(close = true) {
    setEditingId(null); setName(""); setJobTypeIds([]); setActive(true);
    setCategories([newCategory()]);
    if (close) setShowEditor(false);
  }

  function openNew() { resetEditor(false); setShowEditor(true); }
  function editAlbum(album: Album) {
    setEditingId(album.id); setName(album.name); setJobTypeIds(getJobTypeIds(album));
    setActive(album.active !== false); setCategories(album.categories?.length ? album.categories : [newCategory()]);
    setShowEditor(true); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateCategory(id: string, changes: Partial<Category>) {
    setCategories((current) => current.map((category) => category.id === id ? { ...category, ...changes } : category));
  }

  function updatePhotoItem(categoryId: string, itemId: string, changes: Partial<PhotoItem>) {
    setCategories((current) => current.map((category) => category.id === categoryId ? {
      ...category, photoItems: category.photoItems.map((item) => item.id === itemId ? { ...item, ...changes } : item),
    } : category));
  }

  function moveCategory(index: number, amount: -1 | 1) {
    const target = index + amount;
    if (target < 0 || target >= categories.length) return;
    setCategories((current) => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }

  function movePhotoItem(categoryId: string, index: number, amount: -1 | 1) {
    setCategories((current) => current.map((category) => {
      if (category.id !== categoryId) return category;
      const target = index + amount;
      if (target < 0 || target >= category.photoItems.length) return category;
      const photoItems = [...category.photoItems];
      [photoItems[index], photoItems[target]] = [photoItems[target], photoItems[index]];
      return { ...category, photoItems };
    }));
  }

  async function saveAlbum() {
    const selectedJobTypes = jobTypes.filter((item) => jobTypeIds.includes(item.id));
    const cleaned = categories.map((category) => ({ ...category, name: category.name.trim(), photoItems: category.photoItems.map((item) => ({
      ...item, name: item.name.trim(), minimumPhotos: Math.max(0, Number(item.minimumPhotos) || 0),
    })) }));
    if (!name.trim() || !selectedJobTypes.length) return alert("Enter an album name and select at least one job type.");
    if (!cleaned.length || cleaned.some((category) => !category.name || !category.photoItems.length || category.photoItems.some((item) => !item.name))) {
      return alert("Every category needs a name and at least one named photo item.");
    }
    const existing = albums.find((album) => album.id !== editingId && getJobTypeIds(album).some((id) => jobTypeIds.includes(id)));
    if (existing) return alert(`One or more selected job types are already linked to “${existing.name}”.`);

    setSaving(true);
    try {
      const jobTypeNames = selectedJobTypes.map((item) => item.name);
      const values = {
        name: name.trim(), jobTypeIds, jobTypeNames,
        // Keep the first values for compatibility with existing job workflows.
        jobTypeId: jobTypeIds[0], jobTypeName: jobTypeNames[0],
        active, categories: cleaned, updatedAt: serverTimestamp(),
      };
      if (editingId) await updateDoc(doc(clientDb, "companies", COMPANY_ID, "photoAlbumTemplates", editingId), values);
      else await addDoc(collection(clientDb, "companies", COMPANY_ID, "photoAlbumTemplates"), { ...values, createdAt: serverTimestamp() });
      resetEditor();
    } catch (error) { console.error(error); alert("Failed to save the album template."); }
    finally { setSaving(false); }
  }

  async function removeAlbum(album: Album) {
    if (!confirm(`Delete the “${album.name}” album template?`)) return;
    try { await deleteDoc(doc(clientDb, "companies", COMPANY_ID, "photoAlbumTemplates", album.id)); }
    catch (error) { console.error(error); alert("Failed to delete the album template."); }
  }

  return <main className="photo-album-admin min-h-screen bg-[#f5f7fb] p-6 text-gray-900">
    <div className="mx-auto max-w-7xl">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-3xl font-black">Photo Albums</h1><p className="mt-2 text-sm text-gray-500">Configure the photos users must capture for each job type.</p></div>
        <div className="flex gap-3">
          <Link href="/admin" className="rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-gray-700 hover:bg-gray-100">Back to Admin</Link>
          <button onClick={openNew} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700">+ New Album</button>
        </div>
      </header>

      {showEditor && <section className="mb-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex justify-between"><h2 className="text-2xl font-black">{editingId ? "Edit album template" : "New album template"}</h2><button onClick={() => resetEditor()} className="font-bold text-gray-500">Close</button></div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Album name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Major service photos" className="input" /></Field>
          <Field label="Linked job types">
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-gray-300 bg-white p-2 normal-case">
              {jobTypes.filter((item) => item.active !== false).map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold tracking-normal text-gray-700 hover:bg-blue-50">
                <input
                  type="checkbox"
                  checked={jobTypeIds.includes(item.id)}
                  onChange={(event) => setJobTypeIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}
                  className="size-4"
                />
                {item.name}
              </label>)}
            </div>
            <span className="mt-2 block text-xs font-semibold normal-case tracking-normal text-gray-500">{jobTypeIds.length} job type{jobTypeIds.length === 1 ? "" : "s"} selected</span>
          </Field>
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4" />Active template</label>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="text-xl font-black">Categories and required photos</h3><p className="mt-1 text-sm text-gray-500">Set the order technicians will see and the minimum photos needed.</p></div>
          <button onClick={() => setCategories((current) => [...current, newCategory()])} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700">+ Category</button>
        </div>

        <div className="mt-5 space-y-5">{categories.map((category, categoryIndex) => <article key={category.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-8 place-items-center rounded-full bg-gray-900 text-sm font-black text-white">{categoryIndex + 1}</span>
            <input value={category.name} onChange={(e) => updateCategory(category.id, { name: e.target.value })} placeholder="Category, e.g. Vehicle exterior" className="input min-w-56 flex-1 bg-white font-bold" />
            <OrderButtons index={categoryIndex} length={categories.length} move={(amount) => moveCategory(categoryIndex, amount)} />
            <button onClick={() => setCategories((current) => current.filter((item) => item.id !== category.id))} className="px-3 py-2 text-sm font-bold text-red-600">Remove</button>
          </div>
          <label className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <input type="checkbox" checked={category.lockWhenComplete} onChange={(e) => updateCategory(category.id, { lockWhenComplete: e.target.checked })} className="mt-0.5 size-4" />
            <span><strong>Lock when all required minimums are reached</strong><br /><span className="text-amber-800">Administrators can still add, remove, or move photos. Technicians and users cannot edit a locked category.</span></span>
          </label>

          <div className="mt-4 space-y-3">{category.photoItems.map((item, itemIndex) => <div key={item.id} className="grid gap-3 rounded-xl border bg-white p-3 md:grid-cols-[1fr_150px_120px_120px]">
            <Field label="Photo required"><input value={item.name} onChange={(e) => updatePhotoItem(category.id, item.id, { name: e.target.value })} placeholder="e.g. Front of vehicle" className="input" /></Field>
            <Field label="Minimum photos"><input type="number" min="0" value={item.minimumPhotos} onChange={(e) => updatePhotoItem(category.id, item.id, { minimumPhotos: Number(e.target.value) })} className="input" /></Field>
            <Field label="Required"><label className="flex h-12 items-center gap-2 font-bold"><input type="checkbox" checked={item.required} onChange={(e) => updatePhotoItem(category.id, item.id, { required: e.target.checked })} className="size-4" />Yes</label></Field>
            <Field label="Order"><div className="flex h-12 items-center"><OrderButtons index={itemIndex} length={category.photoItems.length} move={(amount) => movePhotoItem(category.id, itemIndex, amount)} /><button onClick={() => updateCategory(category.id, { photoItems: category.photoItems.filter((photo) => photo.id !== item.id) })} className="px-2 text-xl font-bold text-red-600">×</button></div></Field>
          </div>)}</div>
          <button onClick={() => updateCategory(category.id, { photoItems: [...category.photoItems, newPhotoItem()] })} className="mt-4 text-sm font-bold text-blue-700">+ Add required photo</button>
        </article>)}</div>

        <div className="mt-6 flex justify-end gap-3"><button onClick={() => resetEditor()} className="rounded-xl border px-5 py-3 font-bold">Cancel</button><button disabled={saving} onClick={saveAlbum} className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save Album"}</button></div>
      </section>}

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-black">Album templates</h2><p className="mt-1 text-sm text-gray-500">Each album can serve one or multiple job types.</p></div><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search albums or job types…" className="input w-full sm:w-80" /></div>
        {!filteredAlbums.length ? <div className="rounded-2xl border border-dashed p-12 text-center"><div className="text-5xl">📸</div><h3 className="mt-4 text-lg font-black">No album templates yet</h3><p className="mt-2 text-sm text-gray-500">Create an album and link it to a job type.</p></div> :
          <div className="grid gap-4 lg:grid-cols-2">{filteredAlbums.map((album) => <article key={album.id} className="rounded-2xl border p-5">
            <div className="flex justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black">{album.name}</h3><span className={`rounded-full px-2 py-1 text-xs font-bold ${album.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{album.active ? "Active" : "Inactive"}</span></div><div className="mt-2 flex flex-wrap gap-1">{getJobTypeNames(album).map((jobTypeName) => <span key={jobTypeName} className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{jobTypeName}</span>)}</div></div><span className="text-3xl">📷</span></div>
            <div className="mt-4 flex gap-4 text-sm text-gray-500"><span><b className="text-gray-900">{album.categories?.length ?? 0}</b> categories</span><span><b className="text-gray-900">{album.categories?.reduce((sum, category) => sum + category.photoItems.length, 0) ?? 0}</b> photo items</span></div>
            <div className="mt-5 flex gap-2"><button onClick={() => editAlbum(album)} className="flex-1 rounded-xl bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-600">Edit setup</button><button onClick={() => removeAlbum(album)} className="rounded-xl border border-red-200 px-4 py-2 font-bold text-red-600">Delete</button></div>
          </article>)}</div>}
      </section>
    </div>
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-black uppercase tracking-wide text-gray-500"><span className="mb-2 block">{label}</span>{children}</label>;
}

function OrderButtons({ index, length, move }: { index: number; length: number; move: (amount: -1 | 1) => void }) {
  return <div className="flex gap-1"><button disabled={index === 0} onClick={() => move(-1)} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-30" aria-label="Move up">↑</button><button disabled={index === length - 1} onClick={() => move(1)} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-30" aria-label="Move down">↓</button></div>;
}
