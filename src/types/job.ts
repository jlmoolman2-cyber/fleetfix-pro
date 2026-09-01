export type JobStatus =

  string |

  {

    id?: string;

    name: string;

    color?: string;

    textColor?: string;

  };

export type JobLocation =
  | string
  | {
    name?: string;
    addressText?: string;
    googleMapsLink?: string;
  };

export type Job = {
  id: string;
  jobNumber: string;
  status: JobStatus;
  customerName: string;
  description: string;

  location: JobLocation;

  dateBooked: string;

  vehicle: {

    fleetNo: string;

    vehicleReg: string;

    make?: string;

    model?: string;

    type?: string;
  }
  isClosed?: boolean;
  archived?: boolean;
  closedAt?: any;
  assignedUser?: string;
  jobType?: string;
  bookedDate?: Date | null;
  searchText?: string;
  columnValues?: Record<string, any>;
};
