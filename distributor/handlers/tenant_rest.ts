import verifyToken from "../auth";
import handleAutocompleteRequest from "./rest/autocomplete";
import { handleMediaUnitRequest } from "./rest/media_unit";
import handleSearchRequest from "./rest/search";
import handleStorageRequest from "./rest/storage";

export default async function handleTenantREST(req: Request): Promise<Response> {
    // Handle REST API endpoints
    const url = new URL(req.url);
    const auth = req.headers.get("authorization");
    const token = auth?.split(" ")[1];

    if (!token) return new Response("Unauthorized", { status: 401 });
    const verification = await verifyToken(token);
    if (!verification.valid || !verification.payload) {
        return new Response("Unauthorized", { status: 401 });
    }

    // Simple health check endpoint
    if (req.method === "GET" && url.pathname === "/api/v1/health") {
        // Read authorization header
        return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), {
            headers: { "Content-Type": "application/json" },
        });
    }


    if (req.method === "GET" && url.pathname === "/api/v1/media-unit") {
        return await handleMediaUnitRequest(req, verification.payload)
    }

    if (req.method === "POST" && url.pathname === "/api/v1/search") {
        return await handleSearchRequest(req, verification.payload);
    }

    if (req.method === "GET" && url.pathname === "/api/v1/storage") {
        return await handleStorageRequest(req, verification.payload);
    }

    if (req.method === "POST" && url.pathname === "/api/v1/autocomplete") {
        return await handleAutocompleteRequest(req);

    }

    return new Response("Not Found", { status: 404 });
}