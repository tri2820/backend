import { sendJob } from "../..";

export default async function handleAutocompleteRequest(req: Request): Promise<Response> {

    const json = await req.json() as { text?: string };
    if (!json || typeof json.text !== "string") {
        return new Response(JSON.stringify({ error: "Invalid text parameter" }), { status: 400 });
    }

    const job = {
        prompt: json.text,
    }

    const text_generation_output = await new Promise((resolve) => {
        sendJob(job, "text_generation", {
            cont(text_generation_output) {
                resolve(text_generation_output);
            }
        });
    })

    const items = (text_generation_output as any).generated_texts.map((t: string) => ({ text: t })) || [];
    return new Response(JSON.stringify({ items }), { headers: { "Content-Type": "application/json" } });
}