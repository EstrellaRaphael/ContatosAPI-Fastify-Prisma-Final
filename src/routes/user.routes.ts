import type { FastifyInstance } from "fastify";
import { UserUseCase } from "../usecases/user.usecase.js";
import { UserRepositoryPrisma } from "../repositories/user.repository.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import type { UserCreate, UserUpdate } from "../interfaces/user.interface.js";
import {
    UserResponseSchema,
    UserListResponseSchema,
    UserCreateBodySchema,
    UserUpdateBodySchema,
} from "../schemas/user.schema.js";
import { IdParamSchema, ErrorResponseSchema } from "../schemas/shared.schema.js";

const adminGuard = [authMiddleware, requireRole("admin")];

async function userRoutes(fastify: FastifyInstance): Promise<void> {
    const userRepository = new UserRepositoryPrisma();
    const userUseCase = new UserUseCase(userRepository);

    // ─── POST /users — público ────────────────────────────────────────────────
    fastify.post<{ Body: UserCreate }>("/", {
        schema: {
            tags: ["Usuários"],
            summary: "Criar usuário",
            description: "Rota pública. Cria um novo usuário e retorna os dados sem a senha.",
            body: UserCreateBodySchema,
            response: {
                201: UserResponseSchema,
                409: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        const user = await userUseCase.create(request.body);
        return reply.status(201).send(user);
    });

    // ─── GET /users — somente admin ───────────────────────────────────────────
    fastify.get("/", {
        preHandler: adminGuard,
        schema: {
            tags: ["Usuários"],
            summary: "Listar todos os usuários",
            description: "Requer autenticação e papel `admin`.",
            security: [{ EmailAuth: [], PasswordAuth: [] }],
            response: {
                200: UserListResponseSchema,
                401: ErrorResponseSchema,
                403: ErrorResponseSchema,
            },
        },
    }, async (_request, reply) => {
        const users = await userUseCase.findAll();
        return reply.send(users);
    });

    // ─── GET /users/:id — público ─────────────────────────────────────────────
    fastify.get<{ Params: { id: string } }>("/:id", {
        schema: {
            tags: ["Usuários"],
            summary: "Buscar usuário por ID",
            params: IdParamSchema,
            response: {
                200: UserResponseSchema,
                404: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        const user = await userUseCase.findById(request.params.id);
        return reply.send(user);
    });

    // ─── PUT /users/:id — somente admin ──────────────────────────────────────
    fastify.put<{ Params: { id: string }; Body: UserUpdate }>("/:id", {
        preHandler: adminGuard,
        schema: {
            tags: ["Usuários"],
            summary: "Atualizar usuário",
            description: "Requer autenticação e papel `admin`. Todos os campos são opcionais.",
            security: [{ EmailAuth: [], PasswordAuth: [] }],
            params: IdParamSchema,
            body: UserUpdateBodySchema,
            response: {
                200: UserResponseSchema,
                401: ErrorResponseSchema,
                403: ErrorResponseSchema,
                404: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        const user = await userUseCase.update(request.params.id, request.body);
        return reply.send(user);
    });

    // ─── DELETE /users/:id — somente admin ───────────────────────────────────
    fastify.delete<{ Params: { id: string } }>("/:id", {
        preHandler: adminGuard,
        schema: {
            tags: ["Usuários"],
            summary: "Deletar usuário",
            description: "Requer autenticação e papel `admin`. Os contatos do usuário são deletados em cascata.",
            security: [{ EmailAuth: [], PasswordAuth: [] }],
            params: IdParamSchema,
            response: {
                200: UserResponseSchema,
                401: ErrorResponseSchema,
                403: ErrorResponseSchema,
                404: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        const user = await userUseCase.delete(request.params.id);
        return reply.send(user);
    });
}

export { userRoutes };
