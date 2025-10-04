import type { ServerWebSocket } from "bun";
// I have restored your original import. My apologies for changing it.
import { createMessage, parseMessage } from "./message";
import { existsSync } from "fs";
import { mkdirSync } from "fs";

type Client = {
    id: string;
    ws: ServerWebSocket<unknown>;
    is_worker?: boolean;
    worker_type?: string;
}
const clients = new Map<string, Client>();
const PORT = 8041;

const tempdir = '/tmp/birdview_files';
if (!existsSync(tempdir)) {
    mkdirSync(tempdir, { recursive: true });
}


let job_map = new Map<string, { client_id: string }>();
let gathered: { id: string, filepath: string }[] = [];

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
            clients.set(id, { id, ws });
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
                client.is_worker = true;
                client.worker_type = parsed.header.worker_type;
                return;
            }

            if (parsed.header.type === "index") {
                if (!client) return;
                if (!parsed.buffer || !parsed.header.id) return;
                // console.log("Received index message:", parsed);

                // Save buffer to file
                const filepath = `${tempdir}/${parsed.header.id}.jpg`;
                await Bun.write(filepath, parsed.buffer);

                gathered.push({ id: parsed.header.id, filepath });

                // This job is sent by client.id
                job_map.set(parsed.header.id, { client_id: client.id });

                console.log(`Gathered ${gathered.length} items.`);
                if (gathered.length >= 32) {
                    console.log("Gather threshold reached. Distributing jobs to workers...");


                    const inputs = structuredClone(gathered);
                    gathered = []

                    const imageDescriptionWorker = [...clients.values()].find(c => c.is_worker && c.worker_type === 'image_description');
                    imageDescriptionWorker?.ws.send(createMessage({
                        inputs
                    }));

                    const embeddingWorker = [...clients.values()].find(c => c.is_worker && c.worker_type === 'embedding');
                    embeddingWorker?.ws.send(createMessage({
                        inputs
                    }));
                }


            }

            if (parsed.header.type === "index_result") {
                console.log("Received index result from worker:", parsed);
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
                        type: 'index_result',
                        id: output.id,
                        description: output.description
                    });
                    client.ws.send(responseMessage);
                    console.log(`Sent index result to client ${client.id} for job ${output.id}`);
                }
            }
        },
        // This is the only change from your original code.
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