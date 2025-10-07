import { sendJob } from "../..";

export default async function handleAutocompleteRequest(req: Request): Promise<Response> {

    const json = await req.json() as { text?: string };
    if (!json || typeof json.text !== "string") {
        return new Response(JSON.stringify({ error: "Invalid text parameter" }), { status: 400 });
    }

    const job = {
        id: crypto.randomUUID(),
        prompt: json.text,
    }

    console.log('Sending job to worker', job);
    const text_generation_result = await new Promise<{ type: 'text_generation_result', id: string, generated_texts: string[] }>((resolve) => {
        sendJob(job, "text_generation", {
            cont(text_generation_result) {
                resolve(text_generation_result);
            }
        });
    })

    const items = text_generation_result?.generated_texts.map(t => ({ text: t })) || [];
    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });
}