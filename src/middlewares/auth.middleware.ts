import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { UserRepositoryPrisma } from "../repositories/user.repository.js";

const userRepository = new UserRepositoryPrisma();

async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const email = request.headers["email"] as string | undefined;
    const password = request.headers["password"] as string | undefined;

    if (!email || !password) {
        reply.status(401).send({ error: "Credenciais obrigatórias: forneça os headers 'email' e 'password'" });
        return;
    }

    const user = await userRepository.findByEmail(email);
    if (!user) {
        reply.status(401).send({ error: "Credenciais inválidas" });
        return;
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
        reply.status(401).send({ error: "Credenciais inválidas" });
        return;
    }

    request.user = { id: user.id, email: user.email, role: user.role };
}

export { authMiddleware };
