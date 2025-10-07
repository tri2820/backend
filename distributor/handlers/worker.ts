import { type Client, type JobMap } from "..";
import { updateMediaUnitBatch } from "../conn";
import { createMessage } from "../message";

export default async function onWorkerConnection(parsed: any, client: Client, opts: {
    job_map: JobMap;
}) {


    // TODO: Make this REST API later
    // if (parsed.header.type === "summarize_result") {
    //     const outputs = parsed.header.output;
    //     if (!outputs || !Array.isArray(outputs)) return;

    //     for (const output of outputs) {
    //         const job = opts.job_map.get(output.id);
    //         if (!job) {
    //             console.error(`No job found for output id: ${output.id}`);
    //             continue;
    //         }
    //         const client = opts.clients.get(job.ws);
    //         if (!client) {
    //             console.error(`No client found for job id: ${output.id}`);
    //             continue;
    //         }

    //         // Send result back to the original client
    //         const responseMessage = createMessage({
    //             type: 'summarize_result',
    //             id: output.id,
    //             answer: output.answer
    //         });
    //         client.ws.send(responseMessage);
    //         console.log(`Sent summary to client ${client.id} for job ${output.id}`);
    //     }
    // }

    if (parsed.header.type === "fast_embedding_result") {
        const outputs = parsed.header.output as { id: string, embedding: number[] }[];
        // Sanity check
        if (!outputs || !Array.isArray(outputs)) return;
        for (const output of outputs) {
            const job = opts.job_map.get(output.id);
            if (!job) {
                console.error(`No job found for output id: ${output.id}`);
                continue;
            }
            const result = {
                type: 'fast_embedding_result',
                id: output.id,
                embedding: output.embedding
            }

            job.cont(result);
        }
    }


    if (parsed.header.type === "embedding_result") {
        const outputs = parsed.header.output as { id: string, embedding: number[] }[];
        // Sanity check
        if (!outputs || !Array.isArray(outputs)) return;
        await updateMediaUnitBatch(outputs.map((o) => ({ id: o.id, embedding: o.embedding })));
        console.log('Updated embeddings', outputs.length);
    }

    if (parsed.header.type === "image_description_result") {
        const outputs = parsed.header.output as { id: string, description: string }[];
        // Sanity check
        if (!outputs || !Array.isArray(outputs)) return;
        await updateMediaUnitBatch(outputs.map(o => ({ id: o.id, description: o.description })));
        console.log('Updated descriptions', outputs.length);

        for (const output of outputs) {
            const job = opts.job_map.get(output.id);
            if (!job) {
                console.error(`No job found for output id: ${output.id}`);
                continue;
            }
            const result = {
                type: 'image_description_result',
                id: output.id,
                description: output.description
            }

            job.cont(result);
        }
    }
}