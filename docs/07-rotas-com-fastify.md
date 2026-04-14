# Etapa 7 — Rotas com Fastify

## Objetivo

Implementar os endpoints HTTP da API usando o sistema de plugins do Fastify, conectando a camada de transporte (HTTP) à camada de negócio (use cases) com tipagem completa.

---

## O sistema de plugins do Fastify

O Fastify organiza rotas em **plugins** — funções assíncronas que recebem uma instância do Fastify e registram rotas, hooks, e decorações dentro de um escopo isolado.

```ts
async function userRoutes(fastify: FastifyInstance): Promise<void> {
    // Rotas registradas aqui ficam em /users (definido no register)
    fastify.get("/", handler);
    fastify.post("/", handler);
}
```

Para ativar um plugin, usa-se `app.register()` no servidor:

```ts
app.register(userRoutes, { prefix: "/users" });
app.register(contactRoutes, { prefix: "/contacts" });
```

**`prefix`** define o prefixo de todas as rotas dentro do plugin. A rota `fastify.post("/")` em `contactRoutes` fica disponível em `POST /contacts`. A rota `fastify.get("/:id")` em `userRoutes` fica em `GET /users/:id`.

### Por que plugins e não rotas diretamente no servidor?

Registrar tudo em `server.ts` funciona para projetos pequenos, mas escala mal. Com plugins:

- **Isolamento de escopo** — hooks como `addHook("preHandler", ...)` dentro de um plugin afetam apenas as rotas daquele plugin, não toda a aplicação
- **Organização** — cada arquivo de rotas é responsável por um domínio (usuários, contatos)
- **Reutilização** — um plugin pode ser registrado com prefixos ou configurações diferentes

---

## `src/routes/user.routes.ts`

```ts
import type { FastifyInstance } from "fastify";
import { UserUseCase } from "../usecases/user.usecase.js";
import { UserRepositoryPrisma } from "../repositories/user.repository.js";
import type { UserCreate, UserUpdate } from "../interfaces/user.interface.js";

async function userRoutes(fastify: FastifyInstance): Promise<void> {
    const userRepository = new UserRepositoryPrisma();
    const userUseCase = new UserUseCase(userRepository);

    fastify.post<{ Body: UserCreate }>("/", async (request, reply) => {
        const user = await userUseCase.create(request.body);
        return reply.status(201).send(user);
    });

    fastify.get("/", async (_request, reply) => {
        const users = await userUseCase.findAll();
        return reply.send(users);
    });

    fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
        const user = await userUseCase.findById(request.params.id);
        return reply.send(user);
    });

    fastify.put<{ Params: { id: string }; Body: UserUpdate }>("/:id", async (request, reply) => {
        const user = await userUseCase.update(request.params.id, request.body);
        return reply.send(user);
    });

    fastify.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
        const user = await userUseCase.delete(request.params.id);
        return reply.send(user);
    });
}

export { userRoutes };
```

---

### Instanciação dentro do plugin

```ts
const userRepository = new UserRepositoryPrisma();
const userUseCase = new UserUseCase(userRepository);
```

O repositório e o use case são instanciados dentro da função do plugin. Isso ocorre uma única vez, quando o plugin é registrado durante a inicialização do servidor — não a cada requisição.

A injeção de dependência manual acontece aqui: `UserUseCase` recebe `userRepository` concreto. O use case não sabe que é Prisma — ele recebe algo que satisfaz `UserRepository`. No futuro, trocar para `UserRepositoryPostgres` exige mudança apenas nesta linha.

---

### Tipagem genérica das rotas

```ts
fastify.post<{ Body: UserCreate }>("/", async (request, reply) => {
    const user = await userUseCase.create(request.body); // request.body é UserCreate
    return reply.status(201).send(user);
});
```

O parâmetro de tipo `<{ Body: UserCreate }>` instrui o TypeScript sobre a forma do `request.body`. Sem ele, `request.body` seria `unknown`, e qualquer acesso como `request.body.email` geraria erro de compilação.

Os parâmetros de tipo disponíveis são:

| Parâmetro | Corresponde a | Exemplo |
|---|---|---|
| `Body` | `request.body` | `{ Body: UserCreate }` |
| `Params` | `request.params` | `{ Params: { id: string } }` |
| `Querystring` | `request.query` | `{ Querystring: { page: number } }` |
| `Headers` | `request.headers` | `{ Headers: { "x-token": string } }` |

```ts
// Rota com Body e Params tipados simultaneamente
fastify.put<{ Params: { id: string }; Body: UserUpdate }>("/:id", async (request, reply) => {
    const user = await userUseCase.update(request.params.id, request.body);
    return reply.send(user);
});
```

**Importante**: esta tipagem existe **apenas em tempo de compilação**. O Fastify não valida automaticamente se o body recebido satisfaz `UserCreate`. Para validação em runtime, seria necessário usar JSON Schema junto com o `schema` property da rota. Para este projeto, a tipagem de desenvolvimento é suficiente.

---

### Prefixo `_request` nos handlers sem uso

```ts
fastify.get("/", async (_request, reply) => {
```

A convenção de prefixar parâmetros não utilizados com `_` é reconhecida pelo TypeScript e ferramentas de lint: indica que o parâmetro existe (porque a assinatura do callback exige), mas não é usado intencionalmente. Sem o `_`, alguns linters geram warning de "variável declarada mas não usada".

---

### HTTP 201 Created

```ts
return reply.status(201).send(user);
```

**201 Created** é o status semântico correto para criação de recursos, não **200 OK**. A distinção importa porque:
- `200` significa "a operação foi bem-sucedida"
- `201` significa "a operação foi bem-sucedida **e um novo recurso foi criado**"

Clientes e ferramentas de monitoramento podem tratar 201 de forma diferente de 200. Usar o status correto é parte de uma API RESTful bem definida.

---

## `src/routes/contact.routes.ts`

```ts
import type { FastifyInstance } from "fastify";
import { ContactUseCase } from "../usecases/contact.usecase.js";
import { ContactRepositoryPrisma } from "../repositories/contact.repository.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import type { ContactUpdate } from "../interfaces/contact.interface.js";

interface ContactCreateBody {
    name: string;
    phone: string;
    email?: string | null;
}

async function contactRoutes(fastify: FastifyInstance): Promise<void> {
    const contactRepository = new ContactRepositoryPrisma();
    const contactUseCase = new ContactUseCase(contactRepository);

    fastify.addHook("preHandler", authMiddleware);

    fastify.post<{ Body: ContactCreateBody }>("/", async (request, reply) => {
        const contact = await contactUseCase.create(request.user!.id, request.body);
        return reply.status(201).send(contact);
    });

    fastify.get("/", async (request, reply) => {
        const contacts = await contactUseCase.findByUserId(request.user!.id);
        return reply.send(contacts);
    });

    fastify.put<{ Params: { id: string }; Body: ContactUpdate }>("/:id", async (request, reply) => {
        const contact = await contactUseCase.update(
            request.params.id,
            request.user!.id,
            request.body
        );
        return reply.send(contact);
    });

    fastify.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
        const contact = await contactUseCase.delete(request.params.id, request.user!.id);
        return reply.send(contact);
    });
}

export { contactRoutes };
```

---

### `fastify.addHook("preHandler", authMiddleware)`

```ts
fastify.addHook("preHandler", authMiddleware);
```

`addHook` registra uma função que executa em um momento específico do ciclo de vida da requisição. `"preHandler"` executa **depois** que o Fastify parseou a requisição (body, params, headers), mas **antes** de qualquer route handler.

Registrar o hook **dentro** do plugin de contatos significa que ele só executa para as rotas deste plugin. Rotas de usuários (`/users`) não são afetadas. Este é o isolamento de escopo mencionado anteriormente.

### Ciclo de vida de uma requisição autenticada

```
POST /contacts
    │
    ▼
Fastify recebe a requisição
    │
    ▼
Parsing (body, params, headers)
    │
    ▼
preHandler: authMiddleware          ← verifica email + password
    │                                  se inválido: retorna 401 e para aqui
    ▼
Route handler: fastify.post(...)    ← executa apenas se auth passou
    │
    ▼
contactUseCase.create(...)
    │
    ▼
contactRepository.create(...)
    │
    ▼
Prisma → banco de dados
    │
    ▼
reply.status(201).send(contact)
```

---

### `request.user!.id`

```ts
const contact = await contactUseCase.create(request.user!.id, request.body);
```

O `!` é o **non-null assertion operator** do TypeScript. Ele diz ao compilador: "eu garanto que este valor não é `null` ou `undefined`".

A declaração de tipo em `src/types/fastify.d.ts` define `user` como `{ id: string; email: string; role: string } | null`. A princípio, poderia ser `null` quando o middleware não rodou. Mas o `addHook("preHandler", authMiddleware)` garante que o middleware **sempre** executa antes de qualquer handler neste plugin — e o middleware só deixa a requisição prosseguir se definiu `request.user` com um valor.

O uso de `!` documenta essa garantia no código: "este campo é não-nulo aqui porque o middleware garante que está preenchido". Sem o `!`, TypeScript bloquearia o acesso com um erro sobre possível null.

**Risco do `!`**: se o middleware for removido ou a ordem de hooks for alterada, o `!` faz o TypeScript ignorar o problema e o erro aparece em runtime. Este é um caso justificado de uso — a segurança em runtime vem da garantia do hook, não do tipo.

---

### `ContactCreateBody` — interface local

```ts
interface ContactCreateBody {
    name: string;
    phone: string;
    email?: string | null;
}
```

Esta interface é definida localmente no arquivo de rotas, não exportada de `contact.interface.ts`. Por quê?

`ContactCreate` na interface de domínio inclui `userId`, porque o repositório precisa desse campo. Mas o body da requisição **não deve incluir `userId`** — ele vem do contexto de autenticação. Criar uma interface local que representa exatamente o que o cliente envia evita que o `userId` apareça como campo esperado no body.

Isso é uma aplicação do princípio de **menor privilégio de informação**: cada camada recebe apenas os dados de que precisa.
