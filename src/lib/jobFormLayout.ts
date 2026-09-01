export const JOB_FORM_PAGE_HEIGHT = 1123;
export const JOB_FORM_PAGE_GAP = 32;
export const JOB_FORM_PAGE_STRIDE =
  JOB_FORM_PAGE_HEIGHT + JOB_FORM_PAGE_GAP;
export const JOB_FORM_FOOTER_TOP = 1054;

type LayoutField = {
  id: string;
  label?: string;
  pageFooter?: "job-card" | "powered";
  y: number;
  height: number;
};

export function isJobFormFooter(field: LayoutField) {
  if (field.pageFooter === "job-card" || field.pageFooter === "powered") {
    return true;
  }
  const label = String(field.label || "").trim().toLowerCase();
  return label.startsWith("job card -") || label.includes("powered by fleetfix");
}

export function getJobFormPageCount<T extends LayoutField>(
  fields: T[],
  dynamicHeights: Record<string, number> = {}
) {
  return Math.max(
    1,
    ...fields
      .filter((field) => !isJobFormFooter(field))
      .map((field) => {
        const startPage = Math.floor(field.y / JOB_FORM_PAGE_STRIDE);
        const localTop = field.y - startPage * JOB_FORM_PAGE_STRIDE;
        const height = dynamicHeights[field.id] ?? field.height;
        return startPage + Math.max(1, Math.ceil((localTop + height) / JOB_FORM_PAGE_HEIGHT));
      })
  );
}

export function getJobFormCanvasHeight(pageCount: number) {
  return pageCount * JOB_FORM_PAGE_HEIGHT +
    Math.max(0, pageCount - 1) * JOB_FORM_PAGE_GAP;
}

export function moveJobFormFieldsPastFooters<T extends LayoutField>(fields: T[]) {
  const contentFields = fields.filter((field) => !isJobFormFooter(field));
  const footerFields = fields.filter(isJobFormFooter);
  const groups = new Map<number, T[]>();

  for (const field of contentFields) {
    const group = groups.get(field.y) || [];
    group.push(field);
    groups.set(field.y, group);
  }

  let cumulativeShift = 0;
  const moved = new Map<string, T>();
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a - b);

  for (const [originalY, group] of sortedGroups) {
    let nextY = originalY + cumulativeShift;
    const page = Math.floor(nextY / JOB_FORM_PAGE_STRIDE);
    const localY = nextY - page * JOB_FORM_PAGE_STRIDE;
    const tallestField = Math.max(...group.map((field) => field.height));

    if (localY + tallestField > JOB_FORM_FOOTER_TOP) {
      const nextPageY = (page + 1) * JOB_FORM_PAGE_STRIDE + 57;
      cumulativeShift += nextPageY - nextY;
      nextY = nextPageY;
    }

    for (const field of group) {
      moved.set(field.id, { ...field, y: nextY });
    }
  }

  return [
    ...contentFields.map((field) => moved.get(field.id) || field),
    ...footerFields,
  ];
}

export function buildJobFormLayoutFields<T extends LayoutField>(
  fields: T[],
  pageCount: number
) {
  const contentFields = fields.filter((field) => !isJobFormFooter(field));
  const footerFields = fields.filter(isJobFormFooter);
  const jobCardFooter = footerFields.find((field) =>
    field.pageFooter === "job-card" ||
    String(field.label || "").trim().toLowerCase().startsWith("job card -")
  );
  const poweredFooter = footerFields.find((field) =>
    field.pageFooter === "powered" ||
    String(field.label || "").toLowerCase().includes("powered by fleetfix")
  );

  const generated: T[] = [];
  for (let page = 0; page < pageCount; page += 1) {
    for (const footer of [jobCardFooter, poweredFooter]) {
      if (!footer) continue;
      const label = String(footer.label || "").replace(
        /Page\s+\d+\s+of\s+\d+/i,
        `Page ${page + 1} of ${pageCount}`
      );
      generated.push({
        ...footer,
        id: `${footer.id}--generated-page-${page + 1}`,
        label,
        y: page * JOB_FORM_PAGE_STRIDE + JOB_FORM_FOOTER_TOP,
      });
    }
  }

  return [...contentFields, ...generated];
}
