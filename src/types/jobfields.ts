export interface JobField {
  id: string;
  label: string;
  type:
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "checkbox"
  | "dropdown"
  | "photo";

  editable?: boolean;
  system?: boolean;
}

export interface StatusField {
  statusId: number;
  fieldId: string;
  required: boolean;
  visible: boolean;
  sortOrder: number;
}

export interface JobFieldValue {
  jobId: string;
  fieldId: string;
  value: string;
}