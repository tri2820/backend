import { sendJob } from "../..";
import type { TokenPayload } from "../../auth";
import { searchMediaUnitsByEmbedding, type MediaUnit } from "../../conn";
import { buildClusters } from "../../utils/cluster";
import { maskedMediaUnit } from "./utils";
import fs from "fs/promises";
export default async function handleSearchRequest(req: Request, payload: TokenPayload): Promise<Response> {
    const json = await req.json() as { query?: string };
    console.log('Handling search request', json);
    if (!json || typeof json.query !== "string") {
        return new Response(JSON.stringify({ error: "Invalid query parameter" }), { status: 400 });
    }

    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();

            // Helper function to send a JSON object as a newline-delimited chunk
            const sendJsonChunk = (data: object) => {
                controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
            };

            try {
                // --- Part 1: Fetch and send search results ---
                const job = {
                    text: json.query,
                    prompt_name: "query"
                };

                console.log('Sending job to worker for embedding', job);
                const embd_output = await new Promise((resolve) => {
                    sendJob(job, "fast_embedding", { cont: resolve });
                });
                console.log('Embedding output', embd_output);

                const search_result = await searchMediaUnitsByEmbedding((embd_output as any).embedding, payload.tenant_id);
                console.log('Search result', search_result?.length, payload);
                if (!search_result) {
                    sendJsonChunk({ error: "Failed to get search results" });
                    controller.close();
                    return;
                }

                // group by media_id
                const groups = search_result.reduce((acc, item) => {
                    if (!acc[item.media_id]) acc[item.media_id] = [];
                    acc[item.media_id]!.push(item);
                    return acc;
                }, {} as Record<string, (MediaUnit & { _distance: number })[]>);

                type Island = (MediaUnit & { _distance: number })[]
                // For each group, order by at_time, then scan for islands for consecutive frames within X seconds
                const X_SECONDS = 5 * 60;
                const islands: Island[] = [];
                for (const media_id in groups) {
                    const items = groups[media_id]!;
                    items.sort((a, b) => new Date(a.at_time).getTime() - new Date(b.at_time).getTime());
                    let current_island: Island = [];
                    for (let i = 0; i < items.length; i++) {
                        const item = items[i]!;
                        if (current_island.length === 0) {
                            current_island.push(item);
                        } else {
                            const last_item = current_island[current_island.length - 1]!;
                            if ((new Date(item.at_time).getTime() - new Date(last_item.at_time).getTime()) <= X_SECONDS * 1000) {
                                current_island.push(item);
                            } else {
                                if (current_island.length > 0) {
                                    islands.push(current_island);
                                }
                                current_island = [item];
                            }
                        }
                    }
                    if (current_island.length > 0) {
                        islands.push(current_island);
                    }
                }

                // Sort islands by average distance of items in the island
                islands.sort((a, b) => {
                    const avgA = a.reduce((sum, item) => sum + item._distance, 0) / a.length;
                    const avgB = b.reduce((sum, item) => sum + item._distance, 0) / b.length;
                    return avgA - avgB;
                });

                // mask out, only get id, at_time, media_id of each item in each island
                const masked_islands = islands.map(island => island.map(maskedMediaUnit));

                sendJsonChunk({ type: "islands", islands: masked_islands });

                // // TODO: reranker https://huggingface.co/jinaai/jina-reranker-m0
                // --- Part 2: Fetch and send the summary ---
                // Use these for summary also
                const imageContentList = search_result?.slice(0, 5).map(item => ({ type: "image", image: item.path })) ?? [];
                const summary_job = {
                    messages: [
                        {
                            role: 'system',
                            content: [
                                { type: 'text', text: `Answer naturally the following query based on the provided context. If there is no relevant information, says no relevant context.` }
                            ]
                        },
                        {
                            role: 'user',
                            content: [
                                { type: "text", text: `Do you see any "Fly metal thing"` }
                            ]
                        },
                        {
                            role: 'assistant',
                            content: [
                                { type: "text", text: `From the footage, we can see a pendulum, setup inside a lab in California. Swinging back and forth, it creates a mesmerizing motion that captivates the viewer's attention.` }
                            ]
                        },
                        {
                            role: 'user',
                            content: [
                                {
                                    type: "text",
                                    text: `Do you see any "${json.query}"?`
                                },
                                ...imageContentList
                            ]
                        }
                    ]
                }

                console.log('Sending job to worker for summary', summary_job);
                const summary_output = await new Promise((resolve) => {
                    sendJob(summary_job, "qa_vlm", { cont: resolve });
                });

                // --- THIS IS THE FIX ---
                // The worker returns an object like {id: ..., description: ...}. We only need the description text.
                const summaryText = (summary_output as any).description;
                if (summaryText) {
                    sendJsonChunk({ type: "summary", summary: summaryText });
                }

                // All data has been sent, close the stream
                controller.close();

            } catch (error) {
                console.error("Error during stream processing:", error);
                // Inform the client about the error by sending an error object
                sendJsonChunk({ error: "An error occurred while processing the request." });
                controller.close();
            }
        }
    });

    // Return the response with the NDJSON stream
    // The content type can be 'application/x-ndjson' for strictness
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}