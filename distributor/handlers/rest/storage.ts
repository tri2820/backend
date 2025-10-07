import { getMediaUnitById } from "../../conn";
import fs from "fs/promises";
import { maskedMediaUnit } from "./utils";
import type { TokenPayload } from "../../auth";

export default async function handleStorageRequest(req: Request, payload: TokenPayload): Promise<Response> {
    // Get media unit id from query parameters
    const url = new URL(req.url);
    const mediaUnitId = url.searchParams.get("id");
    if (!mediaUnitId) {
        return new Response("Bad Request: Missing media unit id", { status: 400 })
    }

    const mediaUnit = await getMediaUnitById(mediaUnitId, payload.tenant_id);

    const askedForFrame = url.searchParams.get("raw") === "1" || url.searchParams.get("raw") === "true";
    if (askedForFrame) {
        // Read and return the file
        try {
            if (!mediaUnit) {
                return new Response("Not Found", { status: 404 });
            }
            if (!mediaUnit.path) {
                return new Response("Not Found: No raw data for media unit (metadata only)", { status: 404 });
            }
            const fileData = await fs.readFile(mediaUnit.path);
            return new Response(fileData, { headers: { "Content-Type": "application/octet-stream" } });
        } catch (e) {
            console.error("Error reading file", e);
            return new Response("Internal Server Error: Unable to read file", { status: 500 });
        }
    }

    const item = mediaUnit ? maskedMediaUnit(mediaUnit) : null;
    return new Response(JSON.stringify(item), { headers: { "Content-Type": "application/json" } });
}