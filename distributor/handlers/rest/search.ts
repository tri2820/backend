import { sendJob } from "../..";
import { searchMediaUnitsByEmbedding } from "../../conn";
import { maskedMediaUnit } from "./utils";

export default async function handleSearchRequest(req: Request): Promise<Response> {
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

                const search_result = await searchMediaUnitsByEmbedding((embd_output as any).embedding);
                const items = search_result?.map(maskedMediaUnit) || [];

                console.log(`Found ${items.length} search results`);
                // Send the first NDJSON object containing the items
                sendJsonChunk({ items });


                // --- Part 2: Fetch and send the summary ---
                // Use these for summary also
                const imageContentList = search_result?.slice(0, 5).map(item => ({ type: "image", image: item.path })) ?? [];
                const summary_job = {
                    messages: [
                        {
                            role: 'system',
                            content: [
                                { type: 'text', text: `From given frames of the video, try to answer the query. Answer naturally(do not mention video or frames), substantially and in detailed. Give story-like answer if possible. If there is no relevant information, says no relevant context.` }
                            ]
                        },
                        {
                            role: 'user',
                            content: [
                                { type: "text", text: `Fly metal thing` }
                            ]
                        },
                        {
                            role: 'assistant',
                            content: [
                                { type: "text", text: `The thing you are looking for is a pendulum, setup inside a lab in California. Swinging back and forth, it creates a mesmerizing motion that captivates the viewer's attention.` }
                            ]
                        },
                        {
                            role: 'user',
                            content: [
                                {
                                    type: "text",
                                    text: `Try to find information about "${json.query}". Here are some video frames that might be relevant:`
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
                    sendJsonChunk({ summary: summaryText });
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