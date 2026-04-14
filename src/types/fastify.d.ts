import type { } from "fastify";

declare module "fastify" {
    interface FastifyRequest {
        user: {
            id: string;
            email: string;
            role: string;
        } | null;
    }
}
