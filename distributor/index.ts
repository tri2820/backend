import type { ServerWebSocket } from "bun";
// I have restored your original import. My apologies for changing it.
import { addMediaUnit, FILES_DIR, updateMediaUnitBatch } from "./conn";
import { createMessage, parseMessage } from "./message";
import * as jose from 'jose'
import handleAsWorker from "./handlers/worker";
import { handleAsTenant } from "./handlers/tenant";
import handleTenantREST from "./handlers/tenant_rest";

export type Client = {
    id: string;
    authenticated?: {
        tenant_id: string;
    }
    ws: ServerWebSocket<unknown>;
    worker_config?: {
        subscribed_events: string[];
        max_batch_size: number;
        max_latency_ms: number;
        gathered: any[];
        send_timeout?: NodeJS.Timeout;
    },

}

const clients = new Map<ServerWebSocket<unknown>, Client>();
export function broadcastToTenants(message: Buffer | string) {
    for (const client of clients.values()) {
        if (!client.authenticated) continue;
        client.ws.send(message);
    }
}

const PORT = 8040;

let job_map = new Map<string, { ws: ServerWebSocket<unknown> }>();

export function sendJobsToWorkers(c: Client) {
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
    async fetch(req, server) {
        const url = new URL(req.url);
        console.log('HTTP request', req.method, req.url, url.pathname);

        // Dedicated endpoint for WebSocket upgrades
        if (url.pathname === "/ws") {
            const upgraded = server.upgrade(req);
            if (upgraded) {
                // Bun automatically handles the response for successful upgrades
                return;
            }
            return new Response("WebSocket upgrade failed", { status: 400 });
        }


        return handleTenantREST(req);
    },
    websocket: {
        open(ws) {
            const id = crypto.randomUUID();
            clients.set(ws, { id, ws, });
        },
        async message(ws, message) {
            const parsed = parseMessage(message);
            if (parsed.error) {
                console.error("Failed to parse message:", parsed.error);
                return;
            }
            const client = clients.get(ws);

            if (!client) return;

            // === Worker registration and job distribution ===
            if (parsed.header.type === "i_am_worker") {
                if (!parsed.header.worker_config || !Array.isArray(parsed.header.worker_config.subscribed_events)) {
                    console.error("Invalid worker_config from worker.");
                    return;
                }

                if (parsed.header.secret !== process.env.WORKER_SECRET) {
                    console.error("Invalid WORKER_SECRET from worker.");
                    ws.close(1008, "Invalid WORKER_SECRET");
                    return;
                }

                console.log('Registered worker', client.id, parsed.header.worker_config);
                client.worker_config = {
                    max_batch_size: 32,
                    max_latency_ms: 30000,
                    subscribed_events: [],
                    gathered: [],
                };

                client.worker_config = { ...client.worker_config, ...parsed.header.worker_config };
                return;
            }

            // === Authentication ===
            if (parsed.header.type === 'i_am_tenant') {
                if (client.authenticated) {
                    console.error("Client already authenticated.");
                    ws.close(1008, "Already authenticated");
                    return;
                };

                if (parsed.header.create_new) {
                    const tenant_id = crypto.randomUUID();
                    // Can do jti and blacklist later
                    const token = await new jose.SignJWT({ tenant_id })
                        .setProtectedHeader({ alg: 'HS256' })
                        .sign(new TextEncoder().encode(process.env.JWT_SECRET));
                    client.authenticated = {
                        tenant_id,
                    };
                    console.log(`Client ${client.id} authenticated as new tenant ${tenant_id}`);
                    const responseMessage = createMessage({
                        type: 'authenticated',
                        tenant_id,
                        auth_token: token,
                    });
                    ws.send(responseMessage);
                    return;
                }

                if (parsed.header.auth_token) {
                    // Verify JWT token
                    try {
                        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
                        const { payload } = await jose.jwtVerify(parsed.header.auth_token, secret, {
                            algorithms: ['HS256'],
                        });

                        if (!payload.tenant_id || typeof payload.tenant_id !== 'string') {
                            throw new Error("Invalid token: missing tenant_id");
                        }

                        client.authenticated = {
                            tenant_id: payload.tenant_id,
                        };
                        console.log(`Client ${client.id} authenticated as tenant ${payload.tenant_id}`);
                        const responseMessage = createMessage({
                            type: 'authenticated',
                            tenant_id: payload.tenant_id,
                            // No need to send token back
                        });
                        ws.send(responseMessage);
                    } catch (e) {
                        console.error("Failed to verify token:", e);
                        ws.close(1008, "Invalid token");
                    }
                    return;
                }

                console.log('Invalid i_am_tenant message, missing create_new or auth_token');
                ws.close(1008, "Invalid i_am_tenant message");
                return;
            }

            if (client.worker_config) {

                await handleAsWorker(parsed, client, { job_map, broadcastToTenants });
                return;
            }

            if (client.authenticated) {
                await handleAsTenant(parsed, client, { clients, job_map });
                return;
            }

            console.error("Received message from unauthenticated and non-worker client.", parsed);
            ws.close(1008, "Unauthenticated");
        },
        close(ws) {
            clients.delete(ws);
        }
    }, // handlers
});

console.log(`WebSocket server listening on localhost:${PORT}/ws`);