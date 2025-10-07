import * as jose from 'jose'
export type TokenPayload = {
    tenant_id: string;
}
export default async function verifyToken(token: string): Promise<{
    valid: boolean; payload?: TokenPayload
}> {
    try {
        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const result = await jose.jwtVerify(token, secret, {
            algorithms: ['HS256'],
        });

        const payload = result.payload as any;
        if (!payload.tenant_id || typeof payload.tenant_id !== 'string') {
            throw new Error("Invalid token: missing tenant_id");
        }

        return { valid: true, payload };

    } catch (e) {
        console.warn("Token verification error:", e);
        return { valid: false };
    }
}