
export function parseWsMessage(message: Buffer<ArrayBufferLike> | string): {
    header: Record<string, any>;
    buffer?: Uint8Array;
    error?: unknown;
} {
    try {
        if (typeof message === "string") {
            const header = JSON.parse(message) as Record<string, any>;
            return { header };
        }

        // Use a DataView to safely read numbers from the buffer
        const view = new DataView(message.buffer, message.byteOffset, message.byteLength);

        // 1. Read the header length from the first 4 bytes (at offset 0)
        // The 'false' argument specifies Big-Endian, matching our server.
        const headerLength = view.getUint32(0, false);

        // 2. Define the byte offsets for the different parts
        const headerStart = 4; // Header starts after the 4-byte length prefix
        const imageStart = headerStart + headerLength;

        // 3. Decode the header string (from bytes to a string)
        // Use TextDecoder for proper UTF-8 handling.
        const headerSlice = new Uint8Array(message.buffer, message.byteOffset + headerStart, headerLength);
        const headerString = new TextDecoder().decode(headerSlice);
        const header = JSON.parse(headerString);

        // 4. Extract the image data
        // The image is the rest of the buffer after the header.
        if (imageStart >= message.byteLength) {
            return { header };
        }

        const buffer = Uint8Array.prototype.slice.call(message, imageStart);
        return { header, buffer };
    } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
        return { header: {}, error };
    }
}
