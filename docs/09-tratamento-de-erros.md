# Etapa 9 — Tratamento de Erros

## Objetivo

Implementar uma estratégia centralizada e consistente de tratamento de erros usando uma classe de erro customizada (`AppError`) e o mecanismo `setErrorHandler` do Fastify — separando a lógica de erros de negócio do código das rotas.

---

## O problema com tratamento de erros ad hoc

Sem uma estratégia centralizada, cada rota precisa lidar com erros individualmente:

```ts
// Sem estratégia — código repetitivo e inconsistente
fastify.post("/", async (request, reply) => {
    try {
        const user = await userUseCase.create(request.body);
        return reply.status(201).send(user);
    } catch (error) {
        if (error instanceof Error && error.message === "Email já está em uso") {
            return reply.status(409).send({ error: error.message });
        }
        return reply.status(500).send({ error: "Internal server error" });
    }
});
```

Problemas:
- Cada rota tem um bloco `try/catch` idêntico
- O mapeamento de mensagem de erro → status HTTP fica distribuído pelo código
- Erros inesperados podem vazar detalhes internos para o cliente
- Não há forma de garantir um formato de resposta de erro consistente

---

## `src/errors/app-error.ts`

```ts
class AppError extends Error {
    readonly statusCode: number;

    constructor(message: string, statusCode: number = 400) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
    }
}

export { AppError };
```

### Design da classe

**`extends Error`** — `AppError` é uma subclasse de `Error`. Isso garante que:
- `instanceof Error` retorna `true` — comportamento esperado por código que verifica erros genéricos
- `instanceof AppError` retorna `true` — permite distinguir erros de negócio de erros inesperados
- O stack trace é preservado
- Funciona normalmente com `throw`

**`readonly statusCode: number`** — o HTTP status code associado ao erro. Imutável após a criação — um erro 404 não pode ser promovido para 200. O valor padrão `400` é adequado para a maioria dos erros de validação de entrada.

**`this.name = "AppError"`** — corrige o nome que aparece em stack traces. Sem isso, `error.name` seria `"Error"` (da classe pai), perdendo o contexto de que é um erro da aplicação.

### Usos típicos

```ts
// Recurso não encontrado
throw new AppError("Usuário não encontrado", 404);

// Conflito (duplicidade)
throw new AppError("Email já está em uso", 409);

// Proibido (sem permissão sobre o recurso)
throw new AppError("Acesso negado", 403);

// Requisição inválida (padrão — statusCode 400)
throw new AppError("Nome é obrigatório");
```

Os status codes HTTP seguem as convenções REST:

| Status | Semântica | Quando usar |
|---|---|---|
| 400 | Bad Request | Dados de entrada inválidos |
| 401 | Unauthorized | Não autenticado |
| 403 | Forbidden | Autenticado, mas sem permissão |
| 404 | Not Found | Recurso não existe |
| 409 | Conflict | Recurso já existe (duplicidade) |

---

## `setErrorHandler` em `src/server.ts`

```ts
app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
        return reply.status(error.statusCode).send({ error: error.message });
    }
    app.log.error(error);
    return reply.status(500).send({ error: "Erro interno do servidor" });
});
```

`setErrorHandler` registra um handler global que intercepta **qualquer erro** lançado em route handlers ou hooks. O Fastify chama este handler automaticamente quando um `throw` ocorre em código assíncrono.

### Dois caminhos de tratamento

**Caminho 1: `AppError`** — erro de negócio controlado
```
throw new AppError("Email já está em uso", 409)
    ↓
setErrorHandler recebe o erro
    ↓
error instanceof AppError → true
    ↓
reply.status(409).send({ error: "Email já está em uso" })
```

O cliente recebe uma resposta com o status e mensagem exatos que foram definidos ao lançar o erro. A mensagem é segura para exposição — foi escrita com intenção de ser lida pelo cliente.

**Caminho 2: Erro inesperado** — bug ou falha de infraestrutura
```
throw new TypeError("Cannot read property 'id' of undefined")
    ↓
setErrorHandler recebe o erro
    ↓
error instanceof AppError → false
    ↓
app.log.error(error)  ← log completo com stack trace (visível internamente)
    ↓
reply.status(500).send({ error: "Erro interno do servidor" })
```

O cliente recebe apenas `"Erro interno do servidor"` — sem detalhes sobre o bug. Expor stack traces ou mensagens de erro internas ao cliente é uma vulnerabilidade de **information disclosure**: pode revelar nomes de arquivos, estrutura do banco, versões de dependências.

O log interno com `app.log.error(error)` garante que o erro é registrado para investigação, mesmo que o cliente não o veja.

---

## Rotas sem `try/catch`

Com `setErrorHandler`, as rotas ficam completamente limpas:

```ts
fastify.post<{ Body: UserCreate }>("/", async (request, reply) => {
    const user = await userUseCase.create(request.body);
    return reply.status(201).send(user);
});
```

Se `userUseCase.create` lançar `AppError("Email já está em uso", 409)`, o `setErrorHandler` intercepta e envia a resposta correta automaticamente. Se lançar um erro inesperado, o handler genérico registra o log e retorna 500.

**O Fastify captura erros em async handlers automaticamente** — qualquer `throw` dentro de uma função `async` registrada como handler é capturado e encaminhado para o `setErrorHandler`. Não é necessário `try/catch` nas rotas.

Isso é uma consequência de as rotas serem Promises. O Fastify usa `.catch()` nas Promises retornadas pelos handlers para capturar rejeições.

### Comparação com e sem a estratégia

```ts
// Sem a estratégia — 15 linhas por rota, lógica duplicada
fastify.post("/", async (request, reply) => {
    try {
        const user = await userUseCase.create(request.body);
        return reply.status(201).send(user);
    } catch (error) {
        if (error instanceof AppError) {
            return reply.status(error.statusCode).send({ error: error.message });
        }
        app.log.error(error);
        return reply.status(500).send({ error: "Erro interno do servidor" });
    }
});

// Com a estratégia — 4 linhas por rota, lógica centralizada
fastify.post("/", async (request, reply) => {
    const user = await userUseCase.create(request.body);
    return reply.status(201).send(user);
});
```

---

## Fluxo completo de uma requisição com erro

```
POST /users
Body: { name: "João", email: "joao@existente.com", password: "123" }
        │
        ▼
fastify.post handler
        │
        ▼
userUseCase.create(request.body)
        │
        ▼
userRepository.findByEmail("joao@existente.com")
        │
        ▼ retorna user existente
        │
throw new AppError("Email já está em uso", 409)
        │
        ▼ Fastify captura o throw
        │
setErrorHandler(error, _request, reply)
        │
        ▼ error instanceof AppError → true
        │
reply.status(409).send({ error: "Email já está em uso" })
        │
        ▼
Cliente recebe: HTTP 409 { "error": "Email já está em uso" }
```

---

## Formato consistente de resposta de erro

Todos os erros da aplicação seguem o mesmo formato:

```json
{
    "error": "mensagem descritiva"
}
```

Consistência no formato é importante porque:
- **Clientes** (front-end, mobile) podem escrever código genérico para exibir erros
- **Documentação** é mais simples — um único formato para documentar
- **Monitoramento** pode filtrar logs por esse padrão

Se a aplicação crescer e precisar de mais campos (código de erro, detalhes, link para documentação), basta modificar o `setErrorHandler` e `AppError` em um único lugar.
