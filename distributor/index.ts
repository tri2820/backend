import type { ServerWebSocket } from "bun";
// I have restored your original import. My apologies for changing it.
import { createMessage, parseWsMessage } from "./parseMessage";
import { existsSync } from "fs";
import { mkdirSync } from "fs";

type Client = {
    id: string;
    ws: ServerWebSocket<unknown>;
    is_worker?: boolean;
}
const clients = new Map<string, Client>();
const PORT = 8041;

const tempdir = '/tmp/birdview_files';
if (!existsSync(tempdir)) {
    mkdirSync(tempdir, { recursive: true });
}

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
            const parsed = parseWsMessage(message);
            if (parsed.error) {
                console.error("Failed to parse message:", parsed.error);
                return;
            }

            const client = [...clients.values()].find(c => c.ws === ws);

            if (parsed.header.type === "i_am_worker") {
                if (!client) return;
                client.is_worker = true;
                return;
            }

            if (parsed.header.type === "index") {
                if (!parsed.buffer || !parsed.header.id) return;
                console.log("Received index message:", parsed);

                // Save buffer to file
                const filepath = `${tempdir}/${parsed.header.id}.jpg`;
                await Bun.write(filepath, parsed.buffer);

                gathered.push({ id: parsed.header.id, filepath });

                console.log(`Gathered ${gathered.length} items.`);
                if (gathered.length >= 32) {
                    console.log("Gather threshold reached. Distributing jobs to workers...");
                    // Simplify: all to the first worker
                    const worker = [...clients.values()].find(c => c.is_worker);
                    if (!worker) {
                        console.log("No workers connected to distribute jobs.");
                        return;
                    }

                    const inputs = structuredClone(gathered);
                    gathered = []

                    worker.ws.send(JSON.stringify({
                        inputs,
                        type: 'index_job'
                    }));
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