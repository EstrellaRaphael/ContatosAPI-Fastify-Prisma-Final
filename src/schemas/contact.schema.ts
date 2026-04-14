const ContactResponseSchema = {
    type: "object",
    required: ["id", "name", "phone", "createdAt", "updatedAt", "userId"],
    properties: {
        id: { type: "string", description: "UUID do contato" },
        name: { type: "string", description: "Nome do contato" },
        email: {
            anyOf: [{ type: "string", format: "email" }, { type: "null" }],
            description: "Email do contato (opcional, pode ser null)",
        },
        phone: { type: "string", description: "Telefone do contato" },
        createdAt: { type: "string", format: "date-time", description: "Data de criação" },
        updatedAt: { type: "string", format: "date-time", description: "Data da última atualização" },
        userId: { type: "string", description: "UUID do usuário dono deste contato" },
    },
} as const;

const ContactListResponseSchema = {
    type: "array",
    items: ContactResponseSchema,
} as const;

const ContactCreateBodySchema = {
    type: "object",
    required: ["name", "phone"],
    additionalProperties: false,
    properties: {
        name: { type: "string", minLength: 2, description: "Nome do contato" },
        phone: { type: "string", minLength: 8, description: "Telefone do contato" },
        email: {
            anyOf: [{ type: "string", format: "email" }, { type: "null" }],
            description: "Email do contato (opcional)",
        },
    },
} as const;

const ContactUpdateBodySchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        name: { type: "string", minLength: 2, description: "Novo nome" },
        phone: { type: "string", minLength: 8, description: "Novo telefone" },
        email: {
            anyOf: [{ type: "string", format: "email" }, { type: "null" }],
            description: "Novo email (null para remover)",
        },
    },
} as const;

export { ContactResponseSchema, ContactListResponseSchema, ContactCreateBodySchema, ContactUpdateBodySchema };
