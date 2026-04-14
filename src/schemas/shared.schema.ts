const IdParamSchema = {
    type: "object",
    required: ["id"],
    properties: {
        id: { type: "string", description: "UUID do recurso" },
    },
} as const;

const ErrorResponseSchema = {
    type: "object",
    required: ["error"],
    properties: {
        error: { type: "string", description: "Mensagem descritiva do erro" },
    },
} as const;

export { IdParamSchema, ErrorResponseSchema };
