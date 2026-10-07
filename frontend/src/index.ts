import { CatalogLoader, categories, filterParts } from "./catalog.js";
import type { Catalog, CatalogState, Part } from "./catalog.js";

function element<T extends HTMLElement>(id: string): T {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing interface element: ${id}`);
    return node as T;
}
const status = element("status");
const error = element("api-error");
const grid = element("parts");
const count = element("result-count");
const filters = element<HTMLFormElement>("filters");
const search = element<HTMLInputElement>("search");
const category = element<HTMLSelectElement>("category");
const manufacturer = element<HTMLSelectElement>("manufacturer");
const availability = element<HTMLSelectElement>("availability");
const maxPrice = element<HTMLInputElement>("max-price");
const filterError = element("filter-error");
const reload = element<HTMLButtonElement>("reload");
let catalog: Catalog | undefined;
for (const [value, label] of Object.entries(categories)) category.add(new Option(label, value));
const specLabels: Record<string, string> = {
    coreCount: "Cores", threadCount: "Threads", baseClockGhz: "Base clock (GHz)", boostClockGhz: "Boost clock (GHz)",
    wattageW: "Wattage (W)", maxMemoryGb: "Maximum memory (GB)", vramGb: "VRAM (GB)", recommendedPsuW: "Recommended PSU (W)",
    powerConsumptionW: "Power consumption (W)", lengthMm: "Length (mm)", capacityGb: "Capacity (GB)", speedMtS: "Speed (MT/s)",
    moduleCount: "Modules", readSpeedMbS: "Read speed (MB/s)", writeSpeedMbS: "Write speed (MB/s)", maxGpuLengthMm: "Maximum GPU length (mm)"
};
function textNode(tag: string, text: string, className = ""): HTMLElement {
    const node = document.createElement(tag);
    node.textContent = text; node.className = className;
    return node;
}
function card(part: Part): HTMLElement {
    const article = document.createElement("article");
    article.className = "part"; article.dataset.partId = part.id;
    const placeholder = () => textNode("div", `${categories[part.category]} · Image placeholder`, "placeholder");
    if (part.imageIsPlaceholder) article.append(placeholder());
    else {
        const img = document.createElement("img");
        img.src = part.imageUrl; img.alt = part.name; img.loading = "lazy";
        img.addEventListener("error", () => img.replaceWith(placeholder()), { once: true });
        article.append(img);
    }
    article.append(textNode("p", categories[part.category]), textNode("h2", part.name),
        textNode("p", `${part.manufacturer} · ${part.model}`),
        textNode("p", new Intl.NumberFormat("en-US", { style: "currency", currency: part.currency }).format(part.priceCents / 100), "price"),
        textNode("p", part.availability.replaceAll("_", " ")));
    const specs = document.createElement("dl");
    for (const [key, value] of Object.entries(part.specs)) specs.append(textNode("dt", specLabels[key] ?? key.replace(/([A-Z])/g, " $1")), textNode("dd", Array.isArray(value) ? value.join(", ") : String(value)));
    article.append(specs);
    return article;
}
function render(): void {
    if (!catalog) return;
    const validPrice = maxPrice.validity.valid && (maxPrice.value === "" || (Number.isFinite(maxPrice.valueAsNumber) && maxPrice.valueAsNumber >= 0));
    filterError.hidden = validPrice;
    if (!validPrice) { grid.replaceChildren(); count.textContent = "Correct the maximum price to view results."; return; }
    const parts = filterParts(catalog.parts, { search: search.value, category: category.value, manufacturer: manufacturer.value,
        availability: availability.value, maxPriceCents: maxPrice.value === "" ? null : Math.round(maxPrice.valueAsNumber * 100) });
    grid.replaceChildren(...parts.map(card));
    count.textContent = `${parts.length} of ${catalog.parts.length} parts${parts.length === 0 ? " — No parts match your filters." : ""}`;
}
function update(state: CatalogState): void {
    const loading = state.kind === "loading";
    grid.setAttribute("aria-busy", String(loading)); reload.disabled = loading;
    reload.textContent = state.kind === "error" ? "Retry loading catalog" : "Reload catalog";
    error.hidden = state.kind !== "error"; error.textContent = state.kind === "error" ? state.message : "";
    for (const input of filters.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input, select, button")) input.disabled = state.kind !== "ready";
    if (state.kind !== "ready") {
        catalog = undefined; grid.replaceChildren(); count.textContent = ""; filterError.hidden = true;
        status.textContent = loading ? "Loading parts…" : "Catalog could not be loaded.";
        return;
    }
    catalog = state.catalog;
    status.textContent = catalog.isSampleData ? "Sample catalog loaded from the backend. Products and prices are illustrative." : "Catalog loaded from the backend.";
    const selected = manufacturer.value;
    manufacturer.replaceChildren(new Option("All manufacturers", ""), ...[...new Set(catalog.parts.map(part => part.manufacturer))].sort().map(value => new Option(value, value)));
    manufacturer.value = [...manufacturer.options].some(option => option.value === selected) ? selected : "";
    render();
}
const baseUrl = document.querySelector<HTMLMetaElement>('meta[name="parts-api-url"]')?.content ?? "http://localhost:8080";
const loader = new CatalogLoader(baseUrl, update);
filters.addEventListener("submit", event => event.preventDefault());
filters.addEventListener("input", render); filters.addEventListener("change", render);
element("clear").addEventListener("click", () => { filters.reset(); render(); });
reload.addEventListener("click", () => { void loader.load(); });
void loader.load();
