"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, serverTimestamp } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { clientDb, storage } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";

type PhotoItem = { id: string; name: string; minimumPhotos: number; required: boolean };
type Category = { id: string; name: string; lockWhenComplete: boolean; photoItems: PhotoItem[] };
type Album = { id: string; name: string; jobTypeIds?: string[]; jobTypeNames?: string[]; jobTypeId?: string; jobTypeName?: string; active: boolean; categories: Category[] };
type JobPhoto = { id: string; templateId: string; categoryId: string; photoItemId: string; name: string; url: string; path: string };

const MAX_PRINT_EDGE = 2400;
const JPEG_QUALITY = 0.88;

async function preparePhotoForPrint(file: File) {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PRINT_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    image.close();
    throw new Error("Image resizing is not supported by this browser.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  image.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (result) => result ? resolve(result) : reject(new Error("Unable to resize image.")),
    "image/jpeg",
    JPEG_QUALITY,
  ));
  const originalBaseName = file.name.replace(/\.[^.]+$/, "") || "job-photo";
  return { blob, width, height, name: `${originalBaseName}.jpg` };
}

export default function JobPhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<any>(null);
  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);

  useEffect(() => {
    async function loadSetup() {
      try {
        const [jobSnapshot, templateSnapshot] = await Promise.all([
          getDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", id)),
          getDocs(collection(clientDb, "companies", COMPANY_ID, "photoAlbumTemplates")),
        ]);
        if (!jobSnapshot.exists()) return;
        const jobData = { id: jobSnapshot.id, ...jobSnapshot.data() } as any;
        setJob(jobData);
        const templates = templateSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Album, "id">) }));
        const linkedAlbum = templates.find((template) => {
          const ids = template.jobTypeIds?.length ? template.jobTypeIds : template.jobTypeId ? [template.jobTypeId] : [];
          const names = template.jobTypeNames?.length ? template.jobTypeNames : template.jobTypeName ? [template.jobTypeName] : [];
          return template.active !== false && (
            ids.includes(jobData.jobTypeId || "") ||
            names.includes(jobData.jobType || "") ||
            names.includes(jobData.jobTypeName || "")
          );
        });
        setAlbum(linkedAlbum || null);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    loadSetup();
  }, [id]);

  useEffect(() => onSnapshot(
    collection(clientDb, "companies", COMPANY_ID, "jobs", id, "photoAlbumPhotos"),
    (snapshot) => setPhotos(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<JobPhoto, "id">) }))),
    (error) => console.error("Unable to load job photos", error),
  ), [id]);

  const requiredProgress = useMemo(() => {
    if (!album) return { complete: true, uploaded: 0, required: 0 };
    let uploaded = 0;
    let required = 0;
    album.categories.forEach((category) => category.photoItems.filter((item) => item.required).forEach((item) => {
      const minimum = Math.max(0, item.minimumPhotos || 0);
      required += minimum;
      uploaded += Math.min(minimum, photos.filter((photo) => photo.templateId === album.id && photo.categoryId === category.id && photo.photoItemId === item.id).length);
    }));
    return { complete: uploaded >= required, uploaded, required };
  }, [album, photos]);

  function itemPhotos(categoryId: string, itemId: string) {
    return photos.filter((photo) => photo.templateId === album?.id && photo.categoryId === categoryId && photo.photoItemId === itemId);
  }

  function categoryComplete(category: Category) {
    return category.photoItems.filter((item) => item.required).every((item) => itemPhotos(category.id, item.id).length >= Math.max(0, item.minimumPhotos || 0));
  }

  async function uploadPhotos(category: Category, item: PhotoItem, files: FileList | null) {
    if (!files || !album) return;
    if (category.lockWhenComplete && categoryComplete(category)) {
      alert("This category is locked because all required minimums have been uploaded.");
      return;
    }
    setUploadingItem(item.id);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const prepared = await preparePhotoForPrint(file);
        const safeName = prepared.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const path = `companies/${COMPANY_ID}/jobs/${id}/photos/${album.id}/${category.id}/${item.id}/${Date.now()}-${safeName}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, prepared.blob, { contentType: "image/jpeg" });
        const url = await getDownloadURL(storageRef);
        await addDoc(collection(clientDb, "companies", COMPANY_ID, "jobs", id, "photoAlbumPhotos"), {
          templateId: album.id, templateName: album.name,
          categoryId: category.id, categoryName: category.name,
          photoItemId: item.id, photoItemName: item.name,
          name: prepared.name, originalName: file.name, url, path,
          size: prepared.blob.size, originalSize: file.size,
          width: prepared.width, height: prepared.height,
          contentType: "image/jpeg", printOptimized: true,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error(error);
      alert("Photo upload failed. Please try again.");
    } finally {
      setUploadingItem(null);
    }
  }

  async function removePhoto(photo: JobPhoto) {
    if (!confirm("Remove this photo?")) return;
    try {
      if (photo.path) await deleteObject(ref(storage, photo.path));
      await deleteDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", id, "photoAlbumPhotos", photo.id));
    } catch (error) {
      console.error(error);
      alert("The photo could not be removed.");
    }
  }

  if (loading) return <main className="min-h-screen bg-[#f5f7fb] p-8 text-gray-500">Loading photo album…</main>;

  return <main className="min-h-screen bg-[#f5f7fb] p-6 text-gray-900">
    <div className="mx-auto max-w-7xl">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-3xl font-black">{album?.name || "Job Photo Album"}</h1><p className="mt-2 text-sm text-gray-500">{job?.jobNumber ? `Job ${job.jobNumber}` : "Job"} · {job?.jobType || job?.jobTypeName || "No job type"}</p></div>
        <Link href={`/jobs/${id}`} className="rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-gray-700 hover:bg-gray-100">Back to Job</Link>
      </header>

      {!album ? <section className="rounded-3xl border border-amber-200 bg-amber-50 p-10 text-center"><div className="text-5xl">📷</div><h2 className="mt-4 text-xl font-black">No photo album linked</h2><p className="mt-2 text-sm text-amber-800">An administrator must link an active photo album template to this job type.</p></section> : <>
        <section className={`mb-6 rounded-2xl border p-5 ${requiredProgress.complete ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">{requiredProgress.complete ? "Required photos complete" : "Required photos outstanding"}</h2><p className="mt-1 text-sm text-gray-600">{requiredProgress.uploaded} of {requiredProgress.required} required photos uploaded.</p></div><span className={`rounded-full px-4 py-2 text-sm font-black ${requiredProgress.complete ? "bg-green-600 text-white" : "bg-blue-600 text-white"}`}>{requiredProgress.required ? Math.round(requiredProgress.uploaded / requiredProgress.required * 100) : 100}%</span></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white"><div className={`h-full ${requiredProgress.complete ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${requiredProgress.required ? requiredProgress.uploaded / requiredProgress.required * 100 : 100}%` }} /></div>
        </section>

        <div className="space-y-6">{album.categories.map((category) => {
          const complete = categoryComplete(category);
          return <section key={category.id} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-black">{category.name}</h2><p className="mt-1 text-sm text-gray-500">{complete ? "Minimum requirements complete" : "Photos still required"}</p></div>{complete && category.lockWhenComplete && <span className="rounded-full bg-amber-100 px-3 py-2 text-xs font-black text-amber-800">🔒 Category locked</span>}</div>
            <div className="grid gap-5 lg:grid-cols-2">{category.photoItems.map((item) => {
              const uploaded = itemPhotos(category.id, item.id);
              const itemComplete = !item.required || uploaded.length >= item.minimumPhotos;
              const locked = complete && category.lockWhenComplete;
              return <article key={item.id} className="rounded-2xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{item.name}</h3><p className="mt-1 text-xs text-gray-500">Minimum {item.minimumPhotos} · {item.required ? "Required" : "Optional"}</p></div><span className={`rounded-full px-2 py-1 text-xs font-black ${itemComplete ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{uploaded.length}/{item.minimumPhotos}</span></div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{uploaded.map((photo) => <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-xl bg-gray-100"><a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={item.name} className="h-full w-full object-cover" /></a><button onClick={() => removePhoto(photo)} className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-1 text-xs font-black text-white shadow">×</button></div>)}</div>
                <label className={`mt-4 block cursor-pointer rounded-xl border border-dashed px-4 py-3 text-center text-sm font-bold ${locked ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400" : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"}`}>
                  {uploadingItem === item.id ? "Uploading…" : locked ? "Category locked" : "📷 Take or upload photos"}
                  <input type="file" accept="image/*" capture="environment" multiple disabled={locked || uploadingItem !== null} onChange={(event) => { uploadPhotos(category, item, event.target.files); event.target.value = ""; }} className="hidden" />
                </label>
              </article>;
            })}</div>
          </section>;
        })}</div>
      </>}
    </div>
  </main>;
}
