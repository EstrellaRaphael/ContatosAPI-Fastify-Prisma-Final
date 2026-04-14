import type { FastifyReply, FastifyRequest } from "fastify";

function requireRole(...roles: string[]) {
    return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
        if (!request.user) {
            reply.status(401).send({ error: "Autenticação necessária" });
            return;
        }

        if (!roles.includes(request.user.role)) {
            reply
                .status(403)
                .send({ error: `Permissão insuficiente — requer papel: ${roles.join(" ou ")}` });
            return;
        }
    };
}

export { requireRole };
