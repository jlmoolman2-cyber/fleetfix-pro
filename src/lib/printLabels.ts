export function printLabelsInCleanWindow(selector: string, pageWidthMm: number, pageHeightMm: number, isRoll: boolean) {
  const source = document.querySelector<HTMLElement>(selector);
  if (!source) return;

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    alert("Allow pop-ups for FleetFix to print labels.");
    return;
  }

  const clone = source.cloneNode(true) as HTMLElement;
  const originalElements = [source, ...Array.from(source.querySelectorAll<HTMLElement | SVGElement>("*"))];
  const clonedElements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement | SVGElement>("*"))];
  originalElements.forEach((original, index) => {
    const target = clonedElements[index];
    if (!target || !("style" in target)) return;
    const originalInlineStyle = original.getAttribute("style") || "";
    const computed = window.getComputedStyle(original);
    let frozenStyle = "";
    for (const property of Array.from(computed)) frozenStyle += `${property}:${computed.getPropertyValue(property)};`;
    target.setAttribute("style", `${frozenStyle}${originalInlineStyle}`);
  });
  const rollRules = isRoll ? ".label-print-source{display:block!important}.label-print-source>article+article{break-before:page!important;page-break-before:always!important}" : ".label-print-source{display:grid!important}";

  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><title>Stock Labels</title><style>
    @page{size:${pageWidthMm}mm ${pageHeightMm}mm;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0!important;padding:0!important;width:auto!important;max-width:none!important;height:auto!important;min-height:0!important;overflow:visible!important;background:#fff!important}
    body>div{width:auto!important;max-width:none!important;height:auto!important;display:block!important;overflow:visible!important}
    ${rollRules}
    .label-print-source>article{display:flex!important;position:relative!important;box-sizing:border-box!important;flex:none!important;break-inside:avoid!important;page-break-inside:avoid!important}
  </style></head><body><div class="label-print-source">${clone.innerHTML}</div></body></html>`);
  printWindow.document.close();

  const printWhenReady = async () => {
    await Promise.all(Array.from(printWindow.document.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve(); })));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 300));
    printWindow.focus();
    printWindow.print();
    printWindow.onafterprint = () => printWindow.close();
  };
  if (printWindow.document.readyState === "complete") void printWhenReady();
  else printWindow.addEventListener("load", () => void printWhenReady(), { once: true });
}
