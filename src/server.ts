import "dotenv/config";
import fastify from "fastify";
import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { userRoutes } from "./routes/user.routes.js";
import { contactRoutes } from "./routes/contact.routes.js";
import { AppError } from "./errors/app-error.js";

const app: FastifyInstance = fastify({ logger: true });

app.decorateRequest("user", null);

// ─── Swagger ─────────────────────────────────────────────────────────────────
// Deve ser registrado ANTES das rotas para capturar os schemas de cada endpoint
app.register(swagger, {
    openapi: {
        openapi: "3.0.3",
        info: {
            title: "API de Agenda de Contatos",
            description:
                "API RESTful para gerenciamento de usuários e contatos.\n\n" +
                "## Autenticação\n" +
                "Rotas protegidas exigem os headers `email` e `password` em cada requisição. " +
                "Use o botão **Authorize** para preencher as credenciais uma única vez.",
            version: "1.0.0",
        },
        components: {
            securitySchemes: {
                EmailAuth: {
                    type: "apiKey",
                    in: "header",
                    name: "email",
                    description: "Email do usuário cadastrado",
                },
                PasswordAuth: {
                    type: "apiKey",
                    in: "header",
                    name: "password",
                    description: "Senha do usuário em texto puro",
                },
            },
        },
        tags: [
            { name: "Usuários", description: "Gerenciamento de usuários" },
            { name: "Contatos", description: "Gerenciamento de contatos (requer autenticação)" },
        ],
    },
});

app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
        docExpansion: "list",
        deepLinking: true,
    },
});

// ─── Rotas ───────────────────────────────────────────────────────────────────
app.register(userRoutes, { prefix: "/users" });
app.register(contactRoutes, { prefix: "/contacts" });

// ─── Tratamento de erros ─────────────────────────────────────────────────────
app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
        return reply.status(error.statusCode).send({ error: error.message });
    }
    app.log.error(error);
    return reply.status(500).send({ error: "Erro interno do servidor" });
});

const start = async () => {
    try {
        await app.listen({ port: 3100 });
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();
