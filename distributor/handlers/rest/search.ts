import { sendJob } from "../..";
import { searchMediaUnitsByEmbedding } from "../../conn";
import { maskedMediaUnit } from "./utils";

export default async function handleSearchRequest(req: Request): Promise<Response> {
    const json = await req.json() as { query?: string };
    console.log('Handling search request', json);
    if (!json || typeof json.query !== "string") {
        return new Response(JSON.stringify({ error: "Invalid query parameter" }), { status: 400 });
    }

    const job = {
        id: crypto.randomUUID(),
        text: json.query,
        prompt_name: "query"
    }

    console.log('Sending job to worker', job);
    const embd_result = await new Promise<{ type: 'fast_embedding_result', id: string, embedding: any[] }>((resolve) => {
        sendJob(job, "fast_embedding", {
            cont(embd_result) {
                console.log('Received search embedding result', embd_result);
                resolve(embd_result);
            }
        });
    })

    console.log('Search with', embd_result.embedding);
    const search_result = await searchMediaUnitsByEmbedding(embd_result.embedding);
    console.log('Search result', search_result);
    const items = search_result?.map(maskedMediaUnit) || [];

    // Placeholder response
    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });
}