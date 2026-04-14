import type { FastifyInstance } from "fastify";
import { ContactUseCase } from "../usecases/contact.usecase.js";
import { ContactRepositoryPrisma } from "../repositories/contact.repository.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import type { ContactUpdate } from "../interfaces/contact.interface.js";
import {
    ContactResponseSchema,
    ContactListResponseSchema,
    ContactCreateBodySchema,
    ContactUpdateBodySchema,
} from "../schemas/contact.schema.js";
import { IdParamSchema, ErrorResponseSchema } from "../schemas/shared.schema.js";

interface ContactCreateBody {
    name: string;
    phone: string;
    email?: string | null;
}

async function contactRoutes(fastify: FastifyInstance): Promise<void> {
    const contactRepository = new ContactRepositoryPrisma();
    const contactUseCase = new ContactUseCase(contactRepository);

    fastify.addHook("preHandler", authMiddleware);

    // ─── POST /contacts ───────────────────────────────────────────────────────
    fastify.post<{ Body: ContactCreateBody }>("/", {
        schema: {
            tags: ["Contatos"],
            summary: "Criar contato",
            description: "Cria um contato vinculado ao usuário autenticado. O campo `userId` é preenchido automaticamente.",
            security: [{ EmailAuth: [], PasswordAuth: [] }],
            body: ContactCreateBodySchema,
            response: {
                201: ContactResponseSchema,
                401: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        const contact = await contactUseCase.create(request.user!.id, request.body);
        return reply.status(201).send(contact);
    });

    // ─── GET /contacts ────────────────────────────────────────────────────────
    fastify.get("/", {
        schema: {
            tags: ["Contatos"],
            summary: "Listar contatos do usuário autenticado",
            description: "Retorna apenas os contatos pertencentes ao usuário que fez a requisição.",
            security: [{ EmailAuth: [], PasswordAuth: [] }],
            response: {
                200: ContactListResponseSchema,
                401: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        const contacts = await contactUseCase.findByUserId(request.user!.id);
        return reply.send(contacts);
    });

    // ─── PUT /contacts/:id ────────────────────────────────────────────────────
    fastify.put<{ Params: { id: string }; Body: ContactUpdate }>("/:id", {
        schema: {
            tags: ["Contatos"],
            summary: "Atualizar contato",
            description: "Atualiza um contato. Retorna 403 se o contato não pertencer ao usuário autenticado.",
            security: [{ EmailAuth: [], PasswordAuth: [] }],
            params: IdParamSchema,
            body: ContactUpdateBodySchema,
            response: {
                200: ContactResponseSchema,
                401: ErrorResponseSchema,
                403: ErrorResponseSchema,
                404: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        const contact = await contactUseCase.update(
            request.params.id,
            request.user!.id,
            request.body
        );
        return reply.send(contact);
    });

    // ─── DELETE /contacts/:id ─────────────────────────────────────────────────
    fastify.delete<{ Params: { id: string } }>("/:id", {
        schema: {
            tags: ["Contatos"],
            summary: "Deletar contato",
            description: "Deleta um contato. Retorna 403 se o contato não pertencer ao usuário autenticado.",
            security: [{ EmailAuth: [], PasswordAuth: [] }],
            params: IdParamSchema,
            response: {
                200: ContactResponseSchema,
                401: ErrorResponseSchema,
                403: ErrorResponseSchema,
                404: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        const contact = await contactUseCase.delete(request.params.id, request.user!.id);
        return reply.send(contact);
    });
}

export { contactRoutes };
