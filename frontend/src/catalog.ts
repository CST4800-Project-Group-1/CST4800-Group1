export const categories = { cpu: "CPUs", motherboard: "Motherboards", graphics_card: "Graphics cards", ram: "Memory / RAM", storage: "Storage drives", power_supply: "Power supplies", case: "Computer cases" } as const;
export type Category = keyof typeof categories;
export type SpecValue = string | number | string[];
export interface Part {
    id: string; name: string; category: Category; manufacturer: string; model: string;
    priceCents: number; currency: "USD"; imageUrl: string; imageIsPlaceholder: boolean;
    availability: "in_stock" | "out_of_stock" | "preorder";
    specs: Record<string, SpecValue>;
}
export interface Catalog { parts: Part[]; isSampleData: boolean; }
export interface Filters { search: string; category: string; manufacturer: string; availability: string; maxPriceCents: number | null; }
const requiredSpecs: Record<Category, Record<string, "string" | "number" | "array">> = {
    cpu: { socket: "string", coreCount: "number", threadCount: "number", baseClockGhz: "number", boostClockGhz: "number", wattageW: "number" },
    motherboard: { socket: "string", chipset: "string", formFactor: "string", memoryType: "string", maxMemoryGb: "number" },
    graphics_card: { gpuChipset: "string", vramGb: "number", recommendedPsuW: "number", powerConsumptionW: "number", lengthMm: "number" },
    ram: { memoryType: "string", capacityGb: "number", speedMtS: "number", moduleCount: "number" },
    storage: { storageType: "string", capacityGb: "number", interface: "string", readSpeedMbS: "number", writeSpeedMbS: "number" },
    power_supply: { wattageW: "number", efficiencyRating: "string", modularType: "string" },
    case: { supportedMotherboardSizes: "array", maxGpuLengthMm: "number", color: "string" }
};
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isText(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function isSpec(value: unknown): value is SpecValue {
    return isText(value) || (typeof value === "number" && Number.isFinite(value) && value >= 0)
        || (Array.isArray(value) && value.length > 0 && value.every(isText));
}
function isPart(value: unknown): value is Part {
    if (!isObject(value) || !["id", "name", "manufacturer", "model", "imageUrl"].every(key => isText(value[key]))) return false;
    if (typeof value.category !== "string" || !Object.hasOwn(categories, value.category)) return false;
    if (typeof value.priceCents !== "number" || !Number.isSafeInteger(value.priceCents) || value.priceCents < 0 || value.currency !== "USD") return false;
    if (typeof value.imageIsPlaceholder !== "boolean" || !["in_stock", "out_of_stock", "preorder"].includes(String(value.availability))) return false;
    if (value.imageIsPlaceholder) { if (value.imageUrl !== `placeholder:${value.category}`) return false; }
    else { try { if (new URL(String(value.imageUrl)).protocol !== "https:") return false; } catch { return false; } }
    const specs = value.specs;
    if (!isObject(specs) || !Object.values(specs).every(isSpec)) return false;
    return Object.entries(requiredSpecs[value.category as Category]).every(([key, type]) => {
        const spec = specs[key];
        return type === "array" ? Array.isArray(spec) && spec.length > 0 && spec.every(isText)
            : type === "string" ? isText(spec) : typeof spec === "number" && Number.isFinite(spec) && spec > 0;
    });
}
// Qi's full response wraps the SCRUM-3 catalog in data.
export function parseCatalog(payload: unknown): Catalog {
    if (!isObject(payload) || payload.status !== "success" || !isObject(payload.data)
        || payload.data.schemaVersion !== 1 || typeof payload.data.isSampleData !== "boolean"
        || !Array.isArray(payload.data.parts) || !payload.data.parts.every(isPart)) {
        throw new Error("The API returned an invalid catalog. Check the catalog schema and try again.");
    }
    const parts = [...new Map(payload.data.parts.map(part => [part.id, part])).values()];
    return { parts, isSampleData: payload.data.isSampleData };
}
export async function fetchCatalog(baseUrl: string, signal: AbortSignal, request: typeof fetch = fetch): Promise<Catalog> {
    const response = await request(`${baseUrl.replace(/\/+$/, "")}/v1/parts`, { signal, cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`The catalog API returned HTTP ${response.status}. Check that the API and its catalog file are available, then retry.`);
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new Error("The API did not return valid JSON. Please retry."); }
    return parseCatalog(payload);
}
export function filterParts(parts: readonly Part[], filters: Filters): Part[] {
    const words = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return parts.filter(part => {
        if (filters.category && part.category !== filters.category) return false;
        if (filters.manufacturer && part.manufacturer !== filters.manufacturer) return false;
        if (filters.availability && part.availability !== filters.availability) return false;
        if (filters.maxPriceCents !== null && part.priceCents > filters.maxPriceCents) return false;
        const text = [part.name, part.model, part.manufacturer, part.category, categories[part.category], ...Object.values(part.specs).flat()].join(" ").toLowerCase();
        return words.every(word => text.includes(word));
    });
}
export type CatalogState = { kind: "loading" } | { kind: "ready"; catalog: Catalog } | { kind: "error"; message: string };
export class CatalogLoader {
    private controller: AbortController | undefined;
    private generation = 0;
    constructor(private baseUrl: string, private publish: (state: CatalogState) => void, private request: typeof fetch = fetch, private timeoutMs = 10000) {}
    async load(): Promise<void> {
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        const generation = ++this.generation;
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
        this.publish({ kind: "loading" });
        try {
            const catalog = await fetchCatalog(this.baseUrl, controller.signal, this.request);
            if (generation === this.generation) this.publish({ kind: "ready", catalog });
        } catch (error) {
            if (generation !== this.generation) return;
            const message = timedOut ? "The catalog request timed out. Check that the backend is running and retry."
                : error instanceof TypeError ? "Cannot reach the catalog API. Start the backend on port 8080, check its address and CORS settings, then retry."
                : error instanceof Error ? error.message : "The catalog could not be loaded. Please retry.";
            this.publish({ kind: "error", message });
        } finally { clearTimeout(timer); }
    }
}
