import type { ServerWebSocket } from "bun";
import { addMediaUnit, FILES_DIR } from "../conn";
import { sendJobsToWorkers, type Client } from "..";


export async function handleAsTenant(parsed: any, client: Client, opts: {
    clients: Map<ServerWebSocket<unknown>, Client>;
    job_map: Map<string, { ws: ServerWebSocket<unknown> }>;
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

        // For mapping job id to client id (sending back results)
        opts.job_map.set(parsed.header.id, { ws: client.ws });

        for (const c of opts.clients.values()) {
            if (!c.worker_config || !c.worker_config.subscribed_events.includes(parsed.header.type)) continue;
            c.worker_config.gathered.push({ id: parsed.header.id, filepath });
            if (c.worker_config.send_timeout) clearTimeout(c.worker_config.send_timeout);
            if (c.worker_config.gathered.length < (c.worker_config.max_batch_size)) {
                c.worker_config.send_timeout = setTimeout(async () => {
                    sendJobsToWorkers(c);
                }, c.worker_config.max_latency_ms);
            } else {
                sendJobsToWorkers(c);
            }
        }
    }


    if (parsed.header.type === "summarize") {
        if (!parsed.header.id || !parsed.header.passages || !Array.isArray(parsed.header.passages) || !parsed.header.query) return;

        // For mapping job id to client id (sending back results)
        opts.job_map.set(parsed.header.id, { ws: client.ws });

        for (const c of opts.clients.values()) {
            if (!c.worker_config || !c.worker_config.subscribed_events.includes(parsed.header.type)) continue;
            console.log('Got C')
            c.worker_config.gathered.push({ id: parsed.header.id, passages: parsed.header.passages, query: parsed.header.query });
            console.log(`Gathered ${c.worker_config.gathered.length} items.`);
            if (c.worker_config.send_timeout) clearTimeout(c.worker_config.send_timeout);
            if (c.worker_config.gathered.length < (c.worker_config.max_batch_size)) {
                c.worker_config.send_timeout = setTimeout(() => {
                    sendJobsToWorkers(c);
                }, c.worker_config.max_latency_ms);
            } else {
                sendJobsToWorkers(c);
            }
        }
    }

}