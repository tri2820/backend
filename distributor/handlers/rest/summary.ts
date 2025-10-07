import { sendJob } from "../..";

export default async function handleSummaryRequest(req: Request): Promise<Response> {
    const json = await req.json() as { text?: string };
    if (!json || typeof json.text !== "string") {
        return new Response(JSON.stringify({ error: "Invalid text parameter" }), { status: 400 });
    }

    const job = {
        id: crypto.randomUUID(),
        prompt: json.text,
    }

    console.log('Sending job to worker', job);
    const summary_result = await new Promise<{ type: 'summary_result', id: string, answer: string }>((resolve) => {
        sendJob(job, "summary", {
            cont(summary_result) {
                console.log('Received summary result', summary_result);
                resolve(summary_result);
            }
        });
    })

    return new Response(JSON.stringify({ summary: summary_result.answer }), { headers: { "Content-Type": "application/json" } });
}