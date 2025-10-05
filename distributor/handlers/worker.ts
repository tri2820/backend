import type { ServerWebSocket } from "bun";
import type { Client } from "..";
import { createMessage } from "../message";
import { updateMediaUnitBatch } from "../conn";

export default async function handleAsWorker(parsed: any, client: Client, opts: {
    clients: Map<ServerWebSocket<unknown>, Client>;
    job_map: Map<string, { ws: ServerWebSocket<unknown> }>;
}) {
    if (!client.worker_config) return;

    // TODO: Make this REST API later
    if (parsed.header.type === "summarize_result") {
        const outputs = parsed.header.output;
        if (!outputs || !Array.isArray(outputs)) return;

        for (const output of outputs) {
            const job = opts.job_map.get(output.id);
            if (!job) {
                console.error(`No job found for output id: ${output.id}`);
                continue;
            }
            const client = opts.clients.get(job.ws);
            if (!client) {
                console.error(`No client found for job id: ${output.id}`);
                continue;
            }

            // Send result back to the original client
            const responseMessage = createMessage({
                type: 'summarize_result',
                id: output.id,
                answer: output.answer
            });
            client.ws.send(responseMessage);
            console.log(`Sent summary to client ${client.id} for job ${output.id}`);
        }
    }

    if (parsed.header.type === "embedding_result") {
        const embeddings = parsed.header.output as { id: string, embedding: number[] }[];
        // Sanity check
        if (!embeddings || !Array.isArray(embeddings)) return;
        await updateMediaUnitBatch(embeddings.map((e) => ({ id: e.id, embedding: e.embedding })));
        console.log('Updated embeddings', embeddings.length);
    }

    if (parsed.header.type === "image_description_result") {
        const outputs = parsed.header.output as { id: string, description: string }[];
        // Sanity check
        if (!outputs || !Array.isArray(outputs)) return;
        await updateMediaUnitBatch(outputs.map(o => ({ id: o.id, description: o.description })));
        console.log('Updated descriptions', outputs.length);
    }
}