const UserResponseSchema = {
    type: "object",
    required: ["id", "name", "email", "role", "createdAt", "updatedAt"],
    properties: {
        id: { type: "string", description: "UUID do usuário" },
        name: { type: "string", description: "Nome completo" },
        email: { type: "string", format: "email", description: "Endereço de email (único)" },
        role: { type: "string", enum: ["user", "admin"], description: "Papel do usuário no sistema" },
        createdAt: { type: "string", format: "date-time", description: "Data de criação" },
        updatedAt: { type: "string", format: "date-time", description: "Data da última atualização" },
    },
} as const;

const UserListResponseSchema = {
    type: "array",
    items: UserResponseSchema,
} as const;

const UserCreateBodySchema = {
    type: "object",
    required: ["name", "email", "password"],
    additionalProperties: false,
    properties: {
        name: { type: "string", minLength: 2, description: "Nome completo" },
        email: { type: "string", format: "email", description: "Endereço de email" },
        password: { type: "string", minLength: 6, description: "Senha (mínimo 6 caracteres)" },
        role: {
            type: "string",
            enum: ["user", "admin"],
            description: "Papel do usuário (padrão: 'user')",
        },
    },
} as const;

const UserUpdateBodySchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        name: { type: "string", minLength: 2, description: "Novo nome" },
        email: { type: "string", format: "email", description: "Novo email" },
        password: { type: "string", minLength: 6, description: "Nova senha" },
        role: { type: "string", enum: ["user", "admin"], description: "Novo papel" },
    },
} as const;

export { UserResponseSchema, UserListResponseSchema, UserCreateBodySchema, UserUpdateBodySchema };
