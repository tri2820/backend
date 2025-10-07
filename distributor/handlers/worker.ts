import { type Client, type JobMap } from "..";
import { updateMediaUnitBatch } from "../conn";
import { createMessage } from "../message";

export default async function onWorkerConnection(parsed: any, client: Client, opts: {
    job_map: JobMap;
}) {


    if (parsed.header.type === "text_generation_result") {
        const outputs = parsed.header.output as { id: string, generated_texts: string[] }[];
        // Sanity check
        if (!outputs || !Array.isArray(outputs)) return;
        for (const output of outputs) {
            const job = opts.job_map.get(output.id);
            if (!job) {
                console.error(`No job found for output id: ${output.id}`);
                continue;
            }
            const result = {
                type: 'text_generation_result',
                id: output.id,
                // One input, multiple outputs
                generated_texts: output.generated_texts,
            }

            job.cont(result);
        }
    }

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