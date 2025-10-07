import type { ServerWebSocket } from "bun";
// I have restored your original import. My apologies for changing it.
import * as jose from 'jose';
import verifyToken from "./auth";
import { onTenantConnection } from "./handlers/tenant";
import handleTenantREST from "./handlers/tenant_rest";
import { createMessage, parseMessage } from "./message";

export type Client = {
    id: string;
    authenticated?: {
        tenant_id: string;
    }
    ws: ServerWebSocket<unknown>;
    worker_config?: {
        worker_type: string;
        max_batch_size: number;
        max_latency_ms: number;
        gathered: any[];
        send_timeout?: NodeJS.Timeout;
    },
}

export type JobMap = Map<string, { cont: (result: Record<string, any>) => void }>;
const job_map = new Map() as JobMap;
const clients = new Map<ServerWebSocket<unknown>, Client>();

const PORT = 8040;

export function sendJob(job: Record<string, any>, worker_type: string, opts?: {
    cont: (result: Record<string, any>) => void;
}) {
    job.id = crypto.randomUUID();
    if (opts?.cont) {
        job_map.set(job.id, {
            cont: opts.cont
        });
    }

    // TODO: distribute work for all workers of that worker_type, not just the first one
    const worker = clients.values().find(c => c.worker_config?.worker_type === worker_type);
    if (!worker) return;
    worker.worker_config!.gathered.push(job);
    if (worker.worker_config!.send_timeout) clearTimeout(worker.worker_config!.send_timeout);

    if (worker.worker_config!.gathered.length >= (worker.worker_config!.max_batch_size)) {
        workerFlush(worker);
        return;
    }

    worker.worker_config!.send_timeout = setTimeout(async () => {
        workerFlush(worker);
    }, worker.worker_config!.max_latency_ms);
}

export function workerFlush(c: Client) {
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
            console.log('Upgrading to WebSocket');
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
                if (!parsed.header.worker_config || !parsed.header.worker_config.worker_type) {
                    console.error("Invalid worker_config from worker.", parsed);
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
                    worker_type: parsed.header.worker_config.worker_type,
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
                    const { valid, payload } = await verifyToken(parsed.header.auth_token);
                    if (valid && payload) {
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
                    } else {
                        ws.close(1008, "Invalid token");
                    }
                    return;
                }

                console.log('Invalid i_am_tenant message, missing create_new or auth_token');
                ws.close(1008, "Invalid i_am_tenant message");
                return;
            }

            if (client.worker_config) {
                // TODO: Here we assume all workers are BATCH workers
                const outputs = parsed.header.output as any[];
                // Sanity check
                if (!outputs || !Array.isArray(outputs)) return;
                for (const output of outputs) {
                    const job = job_map.get(output.id);
                    job?.cont(output);
                }
                return;
            }

            if (client.authenticated) {
                await onTenantConnection(parsed, client);
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