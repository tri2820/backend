import type { ServerWebSocket } from "bun";
import { parseWsMessage } from "./parseMessage";

type Client = {
    id: string;
    ws: ServerWebSocket<unknown>;
    subscribedRoomIds: Set<string>;
}
const clients = new Map<string, Client>();

// This server receives jobs from media server
// And forward to workers
Bun.serve({
    port: 8040,
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
            clients.set(id, { id, ws, subscribedRoomIds: new Set() });

            ws.send(JSON.stringify({ type: "connected", id }));
        },
        message(ws, message) {
            const parsed = parseWsMessage(message);
            const client = [...clients.values()].find(c => c.ws === ws);

            if (parsed.header.type === "subscribe") {
                if (!client) return;
                const roomId = parsed.header.roomId;
                if (!roomId) return;
                client.subscribedRoomIds.add(roomId);
            }
        }
    }, // handlers
});
