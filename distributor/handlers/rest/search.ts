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
        text: json.query,
        prompt_name: "query"
    }

    console.log('Sending job to worker', job);
    const embd_output = await new Promise((resolve) => {
        sendJob(job, "fast_embedding", {
            cont(embd_output) {
                resolve(embd_output);
            }
        });
    })

    const search_result = await searchMediaUnitsByEmbedding((embd_output as any).embedding);
    const items = search_result?.map(maskedMediaUnit) || [];

    // Use these for summary also
    const summary_job = {
        filepaths: [],
        texts: ["Hello"]
    }

    // Send summary job to worker
    const summary_output = await new Promise((resolve) => {
        sendJob(summary_job, "fast_vlm", {
            cont(summary_output) {
                resolve(summary_output);
            }
        });
    });

    console.log('Summary output', summary_output);

    // Placeholder response
    return new Response(JSON.stringify({ items, summary: summary_output }), { headers: { "Content-Type": "application/json" } });
}