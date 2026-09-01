export function JobsHeader() {
  return (
    <div className="grid grid-cols-7 gap-2 text-xs font-bold text-gray-500 border-b pb-2">
      <div>Job Number</div>
      <div>Status</div>
      <div>Customer</div>
      <div>Vehicle Details</div>
      <div>Description</div>
      <div>Location</div>
      <div>Booking Date</div>
    </div>
  );
}