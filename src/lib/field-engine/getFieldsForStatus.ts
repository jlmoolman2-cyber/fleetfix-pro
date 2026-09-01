export function getFieldsForStatus(
  statusId: number
) {

  // Prevent SSR crash
  if (typeof window === "undefined") {
    return [];
  }

  try {

    // LOAD SAVED STATUS FIELDS
    const saved =
      localStorage.getItem(
        `statusFields_${statusId}`
      );

    // NOTHING SAVED YET
    if (!saved) {
      return [];
    }

    // PARSE SAVED DATA
    const parsed =
      JSON.parse(saved);

    // SAFETY CHECK
    if (!Array.isArray(parsed)) {
      return [];
    }

    // FORMAT FOR FIELD ENGINE
    return parsed.map(
      (
        field: any,
        index: number
      ) => ({

        statusId,

        fieldId: field.id,

        required:
          field.required || false,

        visible: true,

        sortOrder: index + 1,

      })
    );

  } catch (error) {

    console.error(
      "Failed to load status fields",
      error
    );

    return [];
  }
}