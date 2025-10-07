import { sendJob, type Client, type JobMap } from "..";
import { addMediaUnit, FILES_DIR, updateMediaUnit, updateMediaUnitBatch } from "../conn";
import { createMessage } from "../message";


export async function onTenantConnection(parsed: any, client: Client) {
    if (!client.authenticated) return;

    if (parsed.header.type === "index") {
        if (!parsed.buffer || !parsed.header.id || !parsed.header.row) return;

        // Save buffer to file
        const filepath = `${FILES_DIR}/${parsed.header.id}.jpg`;
        await Bun.write(filepath, parsed.buffer);

        addMediaUnit({
            id: parsed.header.id,
            tenant_id: client.authenticated.tenant_id,
            path: filepath,
            at_time: parsed.header.row.at_time,
            media_id: parsed.header.row.media_id,
        });

        const image_description_job = { filepaths: [filepath] };
        sendJob(image_description_job, 'vlm', {
            async cont(output) {
                const message = createMessage({
                    type: 'description',
                    description: (output as any).description,
                });
                client.ws.send(message);

                console.log('Description output', output);
                const update = { id: parsed.header.id, description: (output as any).description }
                await updateMediaUnit(update);
            }
        });

        const embedding_job = { filepath };
        sendJob(embedding_job, 'embedding', {
            async cont(output) {
                const update = { id: parsed.header.id, embedding: (output as any).embedding }
                await updateMediaUnit(update);
            }
        });
    }

}