# Etapa 12 — RBAC: Role-Based Access Control

## Objetivo

Implementar controle de acesso baseado em papéis (RBAC), utilizando o campo `role` já existente no modelo `User` para restringir operações administrativas a usuários com papel `"admin"`.

---

## O que é RBAC?

Role-Based Access Control é um modelo de controle de acesso onde as permissões são associadas a **papéis** (roles), e os usuários recebem papéis. Um usuário tem acesso a uma operação se o seu papel possui aquela permissão.

```
Usuário → tem papel → "admin"
                          ↓
                    pode acessar → GET /users
                                   PUT /users/:id
                                   DELETE /users/:id
```

A alternativa mais simples seria verificar permissões diretamente por usuário — mas isso não escala. Com papéis, adicionar um novo administrador é atribuir o papel `"admin"`, não modificar cada regra de acesso individualmente.

---

## O campo `role` no modelo

O modelo `User` já possui o campo:

```prisma
role String @default("user")
```

Os dois valores suportados são:

| Valor | Significado |
|---|---|
| `"user"` | Usuário comum — acesso apenas às próprias rotas autenticadas (contatos) |
| `"admin"` | Administrador — acesso a operações de gerenciamento de usuários |

O `@default("user")` garante que qualquer usuário criado sem especificar `role` recebe o papel menos privilegiado — princípio do **menor privilégio por padrão**.

---

## `src/middlewares/rbac.middleware.ts`

```ts
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
```

### Design: função de ordem superior

`requireRole` não é diretamente um middleware — é uma **factory de middlewares**. Ela recebe os papéis permitidos e retorna a função preHandler correspondente:

```ts
requireRole("admin")
// retorna: async (request, reply) => { verifica se role === "admin" }

requireRole("admin", "moderator")
// retorna: async (request, reply) => { verifica se role é "admin" ou "moderator" }
```

Isso permite escrever regras expressivas diretamente na definição da rota:

```ts
preHandler: [authMiddleware, requireRole("admin")]
```

Comparado com a alternativa de criar um middleware fixo:

```ts
// Alternativa — um middleware por papel (ruim — não escala)
async function requireAdmin(request, reply) { ... }
async function requireModerator(request, reply) { ... }
```

A factory centraliza a lógica e elimina duplicação. Adicionar um novo papel exige apenas uma nova chamada `requireRole("novo-papel")`, não um novo arquivo.

### `...roles: string[]` — rest parameter

O `...roles` permite passar qualquer número de papéis aceitos:

```ts
requireRole("admin")                    // apenas admin
requireRole("admin", "moderator")       // admin ou moderator
requireRole("admin", "super", "owner")  // qualquer um dos três
```

O método `roles.includes(request.user.role)` verifica se o papel do usuário está entre os aceitos.

### Verificação de `request.user`

```ts
if (!request.user) {
    reply.status(401).send({ error: "Autenticação necessária" });
    return;
}
```

Este check é uma **defesa em profundidade**. Na prática, `requireRole` é sempre usado após `authMiddleware`:

```ts
preHandler: [authMiddleware, requireRole("admin")]
```

O `authMiddleware` já rejeita a requisição com 401 se as credenciais forem inválidas, populando `request.user` apenas em caso de sucesso. Portanto, quando `requireRole` executa, `request.user` nunca é `null`.

Porém, o TypeScript não sabe disso — o tipo é `{ ... } | null`. A verificação explícita satisfaz o compilador e também protege contra uso incorreto de `requireRole` sem `authMiddleware` antes.

---

## Integração nas rotas

### O guard `adminGuard`

```ts
const adminGuard = [authMiddleware, requireRole("admin")];
```

Extrair o array de handlers para uma constante nomeada serve dois propósitos:

1. **Legibilidade** — `preHandler: adminGuard` é mais expressivo que repetir o array em cada rota
2. **Consistência** — alterações no mecanismo de autenticação admin exigem mudança em um único lugar

### Aplicação por rota

```ts
fastify.get("/", {
    preHandler: adminGuard,
    schema: { ... },
}, async (_request, reply) => {
    const users = await userUseCase.findAll();
    return reply.send(users);
});
```

O `preHandler` em nível de rota (dentro do objeto de opções) afeta **apenas aquela rota específica** — diferente de `fastify.addHook("preHandler", ...)` que afetaria todas as rotas do plugin.

---

## Mapa de permissões

| Rota | Método | Acesso |
|---|---|---|
| `POST /users` | Criar usuário | Público |
| `GET /users` | Listar usuários | Admin |
| `GET /users/:id` | Buscar usuário | Público |
| `PUT /users/:id` | Atualizar usuário | Admin |
| `DELETE /users/:id` | Deletar usuário | Admin |
| `POST /contacts` | Criar contato | Autenticado (qualquer role) |
| `GET /contacts` | Listar contatos | Autenticado (qualquer role) |
| `PUT /contacts/:id` | Atualizar contato | Autenticado + dono do contato |
| `DELETE /contacts/:id` | Deletar contato | Autenticado + dono do contato |

---

## Criando o primeiro admin

Como `POST /users` é público e aceita `role` no body, o primeiro administrador é criado explicitamente:

```bash
curl -X POST http://localhost:3100/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Administrador",
    "email": "admin@sistema.com",
    "password": "senhaSegura123",
    "role": "admin"
  }'
```

**Consideração de segurança:** permitir que qualquer requisição defina `role: "admin"` durante o registro é uma simplificação educacional. Em sistemas de produção, algumas estratégias mais seguras:

- **Seed de banco** — o admin inicial é criado por um script de seed que roda uma única vez no deploy
- **Variável de ambiente** — o primeiro usuário registrado com o email definido em `ADMIN_EMAIL` recebe automaticamente `role: "admin"`
- **Rota protegida de promoção** — `PATCH /users/:id/role` acessível apenas por admins existentes (o que cria o problema do primeiro admin, mas resolve com seed)
- **Remoção do campo do body público** — `role` não aparece no `UserCreateBodySchema`, e admins são criados apenas via banco/seed

---

## Fluxo de uma requisição bloqueada por RBAC

```
GET /users
Headers: email: usuario@email.com, password: minhasenha
         (usuário com role: "user")
    │
    ▼
preHandler[0]: authMiddleware
    │ → busca usuário pelo email ✓
    │ → compara senha com hash bcrypt ✓
    │ → define request.user = { id, email, role: "user" }
    ▼
preHandler[1]: requireRole("admin")
    │ → request.user existe ✓
    │ → roles.includes("user") ? → ["admin"].includes("user") → false ✗
    ▼
reply.status(403).send({ error: "Permissão insuficiente — requer papel: admin" })

→ o route handler NUNCA executa
```

### Por que 403 e não 404?

Retornar `404 Not Found` em vez de `403 Forbidden` para rotas restritas é uma técnica de **security through obscurity** — o cliente não sabe se a rota existe ou se não tem acesso. Isso dificulta a descoberta da API por atacantes.

Para este projeto educacional, `403` é mais claro e didático. Em sistemas com requisitos de segurança mais elevados, `404` pode ser preferível para rotas administrativas sensíveis.

---

## Adicionando novos papéis no futuro

Para adicionar um papel `"moderator"` com acesso parcial:

**1. Alterar o schema** (sem migration se for apenas lógica):
```ts
// Nenhuma alteração necessária no banco — role é String genérico
```

**2. Aplicar nas rotas relevantes:**
```ts
const moderatorGuard = [authMiddleware, requireRole("admin", "moderator")];

fastify.get("/", {
    preHandler: moderatorGuard,
    // ...
});
```

**3. Criar usuário com o novo papel:**
```bash
curl -X POST http://localhost:3100/users \
  -d '{ ..., "role": "moderator" }'
```

A arquitetura suporta novos papéis sem modificar `requireRole` ou nenhum middleware existente — apenas novas chamadas com os papéis desejados.
