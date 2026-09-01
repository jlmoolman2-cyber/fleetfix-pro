import { StatusField } from "@/types/fields";

export const statusFields: StatusField[] = [

  /* START WORK */
  {
    statusId: 1,
    fieldId: "startKm",
    required: true,
    visible: true,
    sortOrder: 1,
  },

  {
    statusId: 1,
    fieldId: "travelledFor",
    required: false,
    visible: true,
    sortOrder: 2,
  },

  {
    statusId: 1,
    fieldId: "photoRef",
    required: false,
    visible: true,
    sortOrder: 3,
  },

  {
    statusId: 1,
    fieldId: "jobSummary",
    required: false,
    visible: true,
    sortOrder: 4,
  },

  /* JOB COMPLETE */
  {
    statusId: 2,
    fieldId: "endKm",
    required: true,
    visible: true,
    sortOrder: 1,
  },

  {
    statusId: 2,
    fieldId: "materials",
    required: false,
    visible: true,
    sortOrder: 2,
  },

  {
    statusId: 2,
    fieldId: "completed",
    required: true,
    visible: true,
    sortOrder: 3,
  },

];