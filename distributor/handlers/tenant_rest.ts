export default async function handleTenantREST(req: Request): Promise<Response> {
    // Handle REST API endpoints
    const url = new URL(req.url);
    const auth = req.headers.get("authorization");
    console.log('auth', auth);

    // Simple health check endpoint
    if (req.method === "GET" && url.pathname === "/api/v1/health") {
        // Read authorization header
        return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), {
            headers: { "Content-Type": "application/json" },
        });
    }

    return new Response("Not Found", { status: 404 });
}