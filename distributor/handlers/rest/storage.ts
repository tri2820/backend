import { getMediaUnitById } from "../../conn";
import { maskedMediaUnit } from "./utils";
import type { TokenPayload } from "../../auth";
import { s3Client } from "../../utils/s3_service";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";


export default async function handleStorageRequest(req: Request, payload: TokenPayload): Promise<Response> {
    // Get media unit id from query parameters
    const url = new URL(req.url);
    const mediaUnitId = url.searchParams.get("id");
    if (!mediaUnitId) {
        return new Response("Bad Request: Missing media unit id", { status: 400 })
    }

    const mediaUnit = await getMediaUnitById(mediaUnitId, payload.tenant_id);

    const askedForFrame = url.searchParams.get("raw") === "1" || url.searchParams.get("raw") === "true";
    if (askedForFrame) {
        // Check if media unit exists before generating presigned URL
        if (!mediaUnit) {
            return new Response("Not Found", { status: 404 });
        }

        try {
            // Generate a presigned URL that expires in 24 hours (default)
            const s3_path = `scope_0/${payload.tenant_id}/${mediaUnitId}`;
            const command = new GetObjectCommand({
                Bucket: 'kanto', // Assuming 'kanto' is your bucket name
                Key: s3_path,
            });
            const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour expiry

            console.log(`Generated presigned URL for media unit ${mediaUnitId}: ${downloadUrl}`);

            // Return a redirect response
            return new Response(null, {
                status: 302,
                headers: {
                    Location: downloadUrl
                }
            });
        } catch (e) {
            console.error("Error generating presigned URL", e);
            return new Response("Internal Server Error: Unable to generate download URL", { status: 500 });
        }
    }

    const item = mediaUnit ? maskedMediaUnit(mediaUnit) : null;
    return new Response(JSON.stringify(item), { headers: { "Content-Type": "application/json" } });
}