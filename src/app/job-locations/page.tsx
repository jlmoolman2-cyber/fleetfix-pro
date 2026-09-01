"use client";

import ModuleSearchField from "@/components/ModuleSearchField";

import {
  useEffect,
  useState,
} from "react";

import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";

import {
  clientDb,
} from "@/lib/firebaseClient";

import {
  COMPANY_ID,
} from "@/lib/company";

import PageHeader from "@/app/components/PageHeader";
import {
  coordinatesFromGoogleMapsLink,
  googleMapsLinkFromCoordinates,
} from "@/lib/googleMapsCoordinates";

export default function JobLocationsPage() {

  const [locations, setLocations] =
    useState<any[]>([]);

  const [showAdd, setShowAdd] =
    useState(false);

  const [saving, setSaving] =
    useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: "locationType" | "name" | "address" | "city" | "province" | "country" | "googleMapsLink"; direction: "asc" | "desc" }>({ key: "name", direction: "asc" });
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const [form, setForm] =
    useState({

      locationType: "",

      roadsidePosition: "",

      pointA: "",

      pointB: "",

      nearPoint: "",

      name: "",

      address: "",

      city: "",

      province: "",

      country: "",

      googleMapsLink: "",

      notes: "",

      gpsLat: "",

      gpsLng: "",
    });

  useEffect(() => {

    const unsub = onSnapshot(

      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "job_locations"
      ),

      (snapshot) => {

        setLocations(

          snapshot.docs.map(
            (doc) => ({

              id: doc.id,

              ...doc.data(),
            })
          )
        );
      }
    );

    return () => unsub();

  }, []);

  useEffect(() => {
    try { setColumnWidths(JSON.parse(localStorage.getItem("fleetfix.jobLocations.columnWidths") || "{}")); } catch { setColumnWidths({}); }
  }, []);

  useEffect(() => {
    localStorage.setItem("fleetfix.jobLocations.columnWidths", JSON.stringify(columnWidths));
  }, [columnWidths]);

  async function saveLocation() {

    try {

      setSaving(true);

      await addDoc(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "job_locations"
        ),

        {
          ...form,

          active: true,

          createdAt:
            serverTimestamp(),
        }
      );

      setShowAdd(false);

      setForm({

        locationType: "",

        roadsidePosition: "",

        pointA: "",

        pointB: "",

        nearPoint: "",

        name: "",

        address: "",

        city: "",

        province: "",

        country: "",

        googleMapsLink: "",

        notes: "",

        gpsLat: "",

        gpsLng: "",
      });

    } catch (error) {

      console.error(error);

      alert(
        "Failed to save location"
      );

    } finally {

      setSaving(false);

    }
  }

  function updateCoordinates(field: "gpsLat" | "gpsLng", value: string) {
    setForm((current) => {
      const updated = { ...current, [field]: value };
      const googleMapsLink = googleMapsLinkFromCoordinates(updated.gpsLat, updated.gpsLng);
      return googleMapsLink ? { ...updated, googleMapsLink } : updated;
    });
  }

  function updateGoogleMapsLink(value: string) {
    const coordinates = coordinatesFromGoogleMapsLink(value);
    setForm((current) => ({
      ...current,
      googleMapsLink: value,
      ...(coordinates ? { gpsLat: coordinates.latitude, gpsLng: coordinates.longitude } : {}),
    }));
  }

  const filteredLocations = locations.filter((location) =>
    [location.locationType, location.name, location.address, location.city, location.province, location.country, location.roadsidePosition, location.pointA, location.pointB, location.nearPoint]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );

  const sortedLocations = [...filteredLocations].sort((left, right) => {
    const leftValue = String(left[sort.key] || "");
    const rightValue = String(right[sort.key] || "");
    const result = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? result : -result;
  });

  function changeSort(key: typeof sort.key) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  }

  function sortableHeading(key: typeof sort.key, label: string) {
    return <><button type="button" onClick={() => changeSort(key)} className="inline-flex max-w-full items-center gap-1 font-black hover:text-blue-700" aria-label={`Sort by ${label}`}>
      {label}<span className={sort.key === key ? "text-blue-600" : "text-gray-300"} aria-hidden="true">{sort.key === key ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
    </button><span onMouseDown={(event) => startColumnResize(event, key)} className="absolute right-0 top-0 h-full w-3 cursor-col-resize border-r-2 border-transparent hover:border-blue-500" title="Drag to resize column" /></>;
  }

  function startColumnResize(event: React.MouseEvent, key: typeof sort.key) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[key] || 180;
    const move = (moveEvent: MouseEvent) => setColumnWidths((current) => ({ ...current, [key]: Math.max(90, startWidth + moveEvent.clientX - startX) }));
    const stop = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", stop); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  }

  return (

    <div className="module-list-page bg-[#f5f7fb]">

      <div className="module-list-content relative p-6">

        <PageHeader />

        <div className="module-list-content w-full">

          {/* ACTION BAR */}
          <div className="
            flex
            items-center
            justify-end
            gap-3
            mb-3
            md:absolute
            md:right-6
            md:top-6
            md:mb-0
          ">

            <ModuleSearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search job locations..." className="w-full max-w-[420px]" />

            <button
              onClick={() =>
                setShowAdd(true)
              }
              className="
                bg-blue-600
                hover:bg-blue-700
                text-white
                px-6
                h-11
                rounded-2xl
                font-black
                leading-tight
              "
            >
              + Add<br />Location
            </button>

          </div>

          {/* LIST */}
          <div className="
            module-list-panel
            bg-white
            border
            border-gray-200
            rounded-3xl
            overflow-hidden
            shadow-sm
          ">

            <div className="module-list-scroll">

              <table className="w-full table-fixed text-xs">

                <colgroup>{(["locationType", "name", "address", "city", "province", "country", "googleMapsLink"] as const).map((key) => <col key={key} style={{ width: columnWidths[key] || 180 }} />)}</colgroup>

                <thead>

                  <tr className="
                    bg-gray-50
                    border-b
                    border-gray-200
                    text-left
                    text-[10px]
                    uppercase
                    tracking-wider
                    text-gray-500
                  ">

                    <th className="relative px-4 py-2">
                      {sortableHeading("locationType", "Location Type")}
                    </th>

                    <th className="relative px-4 py-2">
                      {sortableHeading("name", "Location Name")}
                    </th>

                    <th className="relative px-4 py-2">
                      {sortableHeading("address", "Address")}
                    </th>

                    <th className="relative px-4 py-2">
                      {sortableHeading("city", "City")}
                    </th>

                    <th className="relative px-4 py-2">
                      {sortableHeading("province", "Province")}
                    </th>

                    <th className="relative px-4 py-2">
                      {sortableHeading("country", "Country")}
                    </th>

                    <th className="relative px-4 py-2">
                      {sortableHeading("googleMapsLink", "Google Maps")}
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {sortedLocations.map(
                    (location) => (

                      <tr
                        key={location.id}

                        onClick={() =>
                          window.location.href =
                          `/job-locations/${location.id}`
                        }

                        className="
                          border-b
                          border-gray-100
                          hover:bg-blue-50
                          transition
                          cursor-pointer
                          text-xs
                          font-semibold
                          text-slate-700
                        "
                      >

                        <td className="px-4 py-2">
                          {location.locationType || "—"}
                        </td>

                        <td className="
                          px-4
                          py-2
                          font-black
                          text-blue-600
                        ">
                          {location.name}
                        </td>

                        <td className="px-4 py-2">
                          {location.address}
                        </td>

                        <td className="px-4 py-2">
                          {location.city}
                        </td>

                        <td className="px-4 py-2">
                          {location.province}
                        </td>

                        <td className="px-4 py-2">
                          {location.country}
                        </td>

                        <td className="px-4 py-2">

                          {location.googleMapsLink && (

                            <a
                              href={
                                location.googleMapsLink
                              }
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) =>
                                e.stopPropagation()
                              }
                              className="
                                text-blue-600
                                font-bold
                              "
                            >
                              Open Map
                            </a>
                          )}

                        </td>

                      </tr>
                    )
                  )}

                </tbody>

              </table>

            </div>

          </div>

        </div>

      </div>

      {/* ADD MODAL */}
      {showAdd && (

        <div className="
          fixed
          inset-0
          bg-black/40
          z-50
          flex
          items-center
          justify-center
          p-6
        ">

          <div className="
            bg-white
            rounded-3xl
            w-full
            max-w-4xl
            p-8
            max-h-[90vh]
            overflow-y-auto
          ">

            <div className="
              flex
              items-center
              justify-between
              mb-8
            ">

              <h2 className="
                text-3xl
                font-black
              ">
                Add Job Location
              </h2>

              <button
                onClick={() =>
                  setShowAdd(false)
                }
                className="
                  text-2xl
                  font-bold
                "
              >
                ×
              </button>

            </div>

            <div className="
              grid
              grid-cols-1
              xl:grid-cols-6
              gap-6
            ">

              {/* LOCATION TYPE */}
              <div className="xl:col-span-3">

                <label className="
                  block
                  text-sm
                  font-bold
                  mb-2
                ">
                  Location Type
                </label>

                <select
                  value={form.locationType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      locationType:
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
                  "
                >
                  <option value="">Select location type</option>
                  <option value="Parking">Parking</option>
                  <option value="Depot">Depot</option>
                  <option value="Roadside">Roadside</option>
                  <option value="Place">Place</option>
                </select>

              </div>

              {/* LOCATION NAME */}
              <div className="xl:col-span-3">

                <label className="
                  block
                  text-sm
                  font-bold
                  mb-2
                ">
                  Location Name
                </label>

                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      name:
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
                  "
                />

              </div>

              {form.locationType === "Roadside" && (
                <div className="grid grid-cols-1 gap-6 xl:col-span-6 xl:grid-cols-2">
                  <div className="xl:col-span-2">
                    <label className="block text-sm font-bold mb-2">Roadside Position</label>
                    <select value={form.roadsidePosition} onChange={(e) => setForm({ ...form, roadsidePosition: e.target.value })} className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5">
                      <option value="">Select roadside position</option>
                      <option value="between">Standing between Point A and Point B</option>
                      <option value="near">Standing near a Point</option>
                    </select>
                  </div>
                  {form.roadsidePosition === "between" && <>
                    <div><label className="block text-sm font-bold mb-2">Point A</label><input value={form.pointA} onChange={(e) => setForm({ ...form, pointA: e.target.value })} className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5" /></div>
                    <div><label className="block text-sm font-bold mb-2">Point B</label><input value={form.pointB} onChange={(e) => setForm({ ...form, pointB: e.target.value })} className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5" /></div>
                  </>}
                  {form.roadsidePosition === "near" && <div className="xl:col-span-2"><label className="block text-sm font-bold mb-2">Near Point</label><input value={form.nearPoint} onChange={(e) => setForm({ ...form, nearPoint: e.target.value })} className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5" /></div>}
                </div>
              )}

              {/* ADDRESS */}
              {form.locationType !== "Roadside" && <div className="xl:col-span-6">

                <label className="
                  block
                  text-sm
                  font-bold
                  mb-2
                ">
                  Address
                </label>

                <textarea
                  value={form.address}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      address:
                        e.target.value,
                    })
                  }
                  className="
                    w-full
                    h-32
                    rounded-2xl
                    border-2
                    border-gray-200
                    p-5
                  "
                />

              </div>}

              {/* CITY */}
              {form.locationType !== "Roadside" && <div className="xl:col-span-2">

                <label className="block text-sm font-bold mb-2">City</label>

                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5"
                />

              </div>}

              {/* PROVINCE */}
              <div className={form.locationType === "Roadside" ? "xl:col-span-3" : "xl:col-span-2"}>

                <label className="
                  block
                  text-sm
                  font-bold
                  mb-2
                ">
                  Province
                </label>

                <input
                  type="text"
                  value={form.province}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      province:
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
                  "
                />

              </div>

              {/* COUNTRY */}
              <div className={form.locationType === "Roadside" ? "xl:col-span-3" : "xl:col-span-2"}>

                <label className="
                  block
                  text-sm
                  font-bold
                  mb-2
                ">
                  Country
                </label>

                <input
                  type="text"
                  value={form.country}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      country:
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
                  "
                />

              </div>

              {/* GPS LAT */}
              <div className="xl:col-span-3">

                <label className="
                  block
                  text-sm
                  font-bold
                  mb-2
                ">
                  GPS Latitude
                </label>

                <input
                  type="text"
                  value={form.gpsLat}
                  onChange={(e) => updateCoordinates("gpsLat", e.target.value)}
                  className="
                    w-full
                    h-14
                    rounded-2xl
                    border-2
                    border-gray-200
                    px-5
                  "
                />

              </div>

              {/* GPS LNG */}
              <div className="xl:col-span-3">

                <label className="
                  block
                  text-sm
                  font-bold
                  mb-2
                ">
                  GPS Longitude
                </label>

                <input
                  type="text"
                  value={form.gpsLng}
                  onChange={(e) => updateCoordinates("gpsLng", e.target.value)}
                  className="
                    w-full
                    h-14
                    rounded-2xl
                    border-2
                    border-gray-200
                    px-5
                  "
                />

              </div>

              {/* GOOGLE MAPS */}
              <div className="xl:col-span-6">

                <label className="
                  block
                  text-sm
                  font-bold
                  mb-2
                ">
                  Google Maps Link
                </label>

                <input
                  type="text"
                  value={
                    form.googleMapsLink
                  }
                  onChange={(e) => updateGoogleMapsLink(e.target.value)}
                  placeholder="https://maps.google.com/..."
                  className="
                    w-full
                    h-14
                    rounded-2xl
                    border-2
                    border-gray-200
                    px-5
                  "
                />

              </div>

              {/* NOTES */}
              <div className="xl:col-span-6">

                <label className="
                  block
                  text-sm
                  font-bold
                  mb-2
                ">
                  Notes
                </label>

                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notes:
                        e.target.value,
                    })
                  }
                  className="
                    w-full
                    h-32
                    rounded-2xl
                    border-2
                    border-gray-200
                    p-5
                  "
                />

              </div>

            </div>

            {/* FOOTER */}
            <div className="
              flex
              justify-end
              gap-4
              mt-10
            ">

              <button
                onClick={() =>
                  setShowAdd(false)
                }
                className="
                  h-14
                  px-8
                  rounded-2xl
                  bg-gray-200
                  hover:bg-gray-300
                  font-bold
                "
              >
                Cancel
              </button>

              <button
                onClick={saveLocation}
                disabled={saving}
                className="
                  h-14
                  px-8
                  rounded-2xl
                  bg-blue-600
                  hover:bg-blue-700
                  text-white
                  font-black
                "
              >
                {
                  saving
                    ? "Saving..."
                    : "Save Location"
                }
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}
