import type { ServerWebSocket } from "bun";
// I have restored your original import. My apologies for changing it.
import { createMessage, parseMessage } from "./message";
import { existsSync } from "fs";
import { mkdirSync } from "fs";

type Client = {
    id: string;
    ws: ServerWebSocket<unknown>;
    worker_config?: {
        subscribed_events: string[];
        max_batch_size: number;
        max_latency_ms: number;
        gathered: { id: string, filepath: string }[];
        send_timeout?: NodeJS.Timeout;
    },

}
const clients = new Map<string, Client>();
const PORT = 8041;

const tempdir = '/home/tri/birdview_files';
if (!existsSync(tempdir)) {
    mkdirSync(tempdir, { recursive: true });
}


let job_map = new Map<string, { client_id: string }>();

function sendJobsToWorkers(c: Client) {
    // This function might be called from timeout, so check everything
    if (!c.ws || c.ws.readyState !== WebSocket.OPEN) return;
    if (!c.worker_config) return;
    const inputs = structuredClone(c.worker_config.gathered);
    c.worker_config.gathered = []
    c.ws.send(createMessage({
        inputs
    }));
}

// This server receives jobs from media server
// Gather jobs and distribute to workers
Bun.serve({
    port: PORT,
    fetch(req, server) {
        // upgrade the request to a WebSocket
        if (server.upgrade(req)) {
            return; // do not return a Response
        }
        return new Response("Upgrade failed", { status: 500 });
    },
    websocket: {
        open(ws) {
            console.log("WebSocket opened!");
            const id = crypto.randomUUID();
            clients.set(id, { id, ws, });
        },
        async message(ws, message) {
            console.log("Received message:", message);
            const parsed = parseMessage(message);
            if (parsed.error) {
                console.error("Failed to parse message:", parsed.error);
                return;
            }

            const client = [...clients.values()].find(c => c.ws === ws);

            if (parsed.header.type === "i_am_worker") {
                if (!client) return;
                if (!parsed.header.worker_config || !Array.isArray(parsed.header.worker_config.subscribed_events)) {
                    console.error("Invalid worker_config from worker.");
                    return;
                }
                client.worker_config = {
                    max_batch_size: 32,
                    max_latency_ms: 30000,
                    subscribed_events: [],
                    gathered: [],
                };

                client.worker_config = { ...client.worker_config, ...parsed.header.worker_config };
                return;
            }

            if (parsed.header.type === "index") {
                if (!client) return;
                if (!parsed.buffer || !parsed.header.id) return;

                // Save buffer to file
                const filepath = `${tempdir}/${parsed.header.id}.jpg`;
                await Bun.write(filepath, parsed.buffer);

                // For mapping job id to client id (sending back results)
                job_map.set(parsed.header.id, { client_id: client.id });

                for (const c of clients.values()) {
                    if (!c.worker_config || !c.worker_config.subscribed_events.includes(parsed.header.type)) continue;
                    c.worker_config.gathered.push({ id: parsed.header.id, filepath });
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

            if (parsed.header.type === "embedding_result") {
                const embeddings = parsed.header.output;
                // Sanity check
                if (!embeddings || !Array.isArray(embeddings)) return;

                for (const embedding of embeddings) {
                    const job = job_map.get(embedding.id);
                    if (!job) {
                        console.error(`No job found for embedding id: ${embedding.id}`);
                        continue;
                    }
                    const client = clients.get(job.client_id);
                    if (!client) {
                        console.error(`No client found for job id: ${job.client_id}`);
                        continue;
                    }

                    // Send result back to the original client
                    const responseMessage = createMessage({
                        type: 'embedding_result',
                        id: embedding.id,
                        embedding: embedding.embedding
                    });
                    client.ws.send(responseMessage);
                    console.log(`Sent embedding to client ${client.id} for job ${embedding.id}`);
                }
            }

            if (parsed.header.type === "image_description_result") {
                const outputs = parsed.header.output;
                if (!outputs || !Array.isArray(outputs)) return;

                for (const output of outputs) {
                    const job = job_map.get(output.id);
                    if (!job) {
                        console.error(`No job found for output id: ${output.id}`);
                        continue;
                    }
                    const client = clients.get(job.client_id);
                    if (!client) {
                        console.error(`No client found for job id: ${job.client_id}`);
                        continue;
                    }

                    // Send result back to the original client
                    const responseMessage = createMessage({
                        type: 'image_description_result',
                        id: output.id,
                        description: output.description
                    });
                    client.ws.send(responseMessage);
                    console.log(`Sent image_description to client ${client.id} for job ${output.id}`);
                }
            }
        },

        close(ws) {
            // Find the client associated with the disconnected websocket
            let clientId: string | null = null;
            for (const [id, client] of clients.entries()) {
                if (client.ws === ws) {
                    clientId = id;
                    break;
                }
            }

            // If found, remove them from the map
            if (clientId) {
                clients.delete(clientId);
                console.log(`Client ${clientId} disconnected and was removed.`);
                console.log(`Remaining clients: ${clients.size}`);
            }
        }
    }, // handlers
});

console.log(`WebSocket server listening on ws://localhost:${PORT}`);