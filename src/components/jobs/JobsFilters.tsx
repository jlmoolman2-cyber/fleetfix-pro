export function JobsFilters() {
  return (
    <div className="flex flex-wrap gap-2 items-center mb-4">
      <input
        type="text"
        placeholder="Search"
        className="border px-3 py-2 rounded w-64"
      />
      <select className="border px-2 py-2 rounded">
        <option>Employee</option>
      </select>
      <select className="border px-2 py-2 rounded">
        <option>Job Status</option>
      </select>
      <select className="border px-2 py-2 rounded">
        <option>Job Type</option>
      </select>
      <select className="border px-2 py-2 rounded">
        <option>Van</option>
      </select>
      <button className="border px-3 py-2 rounded">Filter</button>
    </div>
  );
}
