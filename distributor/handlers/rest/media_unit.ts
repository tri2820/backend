import { URL } from "url";
import { getMediaUnitsPaginated } from "../../conn";
import type { TokenPayload } from "../../auth";

export const handleMediaUnitRequest = async (
    req: Request,
    payload: TokenPayload
): Promise<Response> => {
    console.log('Handling media unit request for tenant:', payload.tenant_id);

    // Use URL constructor for robust parsing of path and query params
    const requestUrl = new URL(req.url, `http://${req.headers.get("host") || "localhost"}`);

    // Extract pagination parameters from query string
    const pageParam = requestUrl.searchParams.get("page");
    const limitParam = requestUrl.searchParams.get("limit");

    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const limit = limitParam ? parseInt(limitParam, 10) : 10;

    // Validate pagination parameters
    if (isNaN(page) || page < 1) {
        return new Response(JSON.stringify({ error: "Invalid page parameter. Must be a positive integer." }), { status: 400 });
    }

    if (isNaN(limit) || limit < 1 || limit > 100) { // Maximum 100 per page
        return new Response(JSON.stringify({ error: "Invalid limit parameter. Must be a positive integer between 1 and 100." }), { status: 400 });
    }

    try {
        const result = await getMediaUnitsPaginated(payload.tenant_id, page, limit);

        if (!result) {
            return new Response(JSON.stringify({ error: "Failed to retrieve media units" }), { status: 500 });
        }

        const { items, total } = result;

        // Calculate pagination metadata
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        return new Response(JSON.stringify({
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage,
                hasPrevPage
            }
        }));
    } catch (error) {
        console.error("Error in handleMediaUnitRequest:", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
    }
};