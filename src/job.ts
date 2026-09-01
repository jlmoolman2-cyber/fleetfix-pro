export type JobStatus =
  | "pending"
  | "enroute"
  | "on_site"
  | "on_hold"
  | "completed";

export type Job = {
  id: string;
  jobNumber: string;
  status: JobStatus;
  customerName: string;
  description: string;

  location:
  | string
  | {
    name?: string;
    addressText?: string;
    googleMapsLink?: string;
  };

  dateBooked: string;

  vehicle: {
    fleetNo: string;
    vehicleReg: string;
  };
};