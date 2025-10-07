import type { ServerWebSocket } from "bun";
import { sendJob, type Client, type JobMap } from "..";
import { addMediaUnit, FILES_DIR } from "../conn";
import { createMessage } from "../message";


export async function onTenantConnection(parsed: any, client: Client, opts: {
    job_map: JobMap;
}) {
    if (!client.authenticated) return;

    if (parsed.header.type === "index") {
        if (!parsed.buffer || !parsed.header.id || !parsed.header.row) return;

        // Save buffer to file
        const filepath = `${FILES_DIR}/${parsed.header.id}.jpg`;
        await Bun.write(filepath, parsed.buffer);

        addMediaUnit({
            id: parsed.header.id,
            tenant_id: client.authenticated.tenant_id,
            path: filepath,
            at_time: parsed.header.row.at_time,
            media_id: parsed.header.row.media_id,
        });

        sendJob({ id: parsed.header.id, filepath }, 'index', {
            cont(result: { type: 'image_description_result', id: string, description: string }) {
                const message = createMessage(result);
                client.ws.send(message);
            }
        });
    }

    // if (parsed.header.type === "summarize") {
    //     if (!parsed.header.id || !parsed.header.passages || !Array.isArray(parsed.header.passages) || !parsed.header.query) return;

    //     // For mapping job id to client id (sending back results)
    //     opts.job_map.set(parsed.header.id, {
    //         cont(result: { type: 'summarize_result', id: string, answer: string }) {
    //             const message = createMessage(result);
    //             client.ws.send(message);
    //         }
    //     });

    //     for (const c of opts.clients.values()) {
    //         if (!c.worker_config || !c.worker_config.subscribed_events.includes(parsed.header.type)) continue;
    //         console.log('Got C')
    //         c.worker_config.gathered.push({ id: parsed.header.id, passages: parsed.header.passages, query: parsed.header.query });
    //         console.log(`Gathered ${c.worker_config.gathered.length} items.`);
    //         if (c.worker_config.send_timeout) clearTimeout(c.worker_config.send_timeout);
    //         if (c.worker_config.gathered.length < (c.worker_config.max_batch_size)) {
    //             c.worker_config.send_timeout = setTimeout(() => {
    //                 sendJobsToWorker(c);
    //             }, c.worker_config.max_latency_ms);
    //         } else {
    //             sendJobsToWorker(c);
    //         }
    //     }
    // }

}