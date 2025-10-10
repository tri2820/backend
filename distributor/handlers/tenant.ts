import { sendJob, type Client } from "..";
import { addMediaUnit, FILES_DIR, updateMediaUnit } from "../conn";
import { createMessage } from "../message";
import { s3Client } from "../utils/s3_service";
import { PutObjectCommand } from "@aws-sdk/client-s3";

let logging = {
    num: 0,
}
async function upload(path: string, buffer: ArrayBuffer) {
    logging.num += 1;
    if (logging.num % 100 === 0) {
        console.log(`Uploading to S3 object ${path}. Num uploaded: ${logging.num}`);
    }
    try {
        // Upload to S3 using AWS SDK
        const command = new PutObjectCommand({
            Bucket: 'kanto', // Assuming 'kanto' is your bucket name
            Key: path,
            Body: Buffer.from(buffer),
        });
        await s3Client.send(command);
    } catch (err) {
        console.error("Failed to upload to S3:", (err as any).message);
    }

}

export async function onTenantConnection(parsed: any, client: Client) {
    if (!client.authenticated) return;

    if (parsed.header.type === "index") {
        if (!parsed.buffer || !parsed.header.id || !parsed.header.row) return;

        // Save buffer to file
        const filepath = `${FILES_DIR}/${parsed.header.id}.jpg`;
        await Bun.write(filepath, parsed.buffer);

        // Save to S3 to serve
        upload(`scope_0/${client.authenticated!.tenant_id}/${parsed.header.id}`, parsed.buffer);

        addMediaUnit({
            id: parsed.header.id,
            tenant_id: client.authenticated.tenant_id,
            path: filepath,
            at_time: parsed.header.row.at_time,
            media_id: parsed.header.row.media_id,
        });

        const image_description_job = {
            messages: [
                {
                    role: 'system',
                    content: [
                        { type: 'text', text: `Describe the image in detailed. Focus on the object and less on the context.` }
                    ]
                },
                {
                    "role": "user",
                    "content": [
                        { "type": "image", "image": filepath },
                    ]
                }
            ]
        };
        sendJob(image_description_job, 'vlm', {
            async cont(output) {
                const message = createMessage({
                    type: 'update',
                    data: {
                        id: parsed.header.id,
                        media_id: parsed.header.row.media_id,
                        at_time: parsed.header.row.at_time,
                        description: (output as any).description,
                    }
                });
                client.ws.send(message);
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