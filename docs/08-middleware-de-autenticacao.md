# Etapa 8 — Middleware de Autenticação

## Objetivo

Implementar o mecanismo de autenticação que protege as rotas de contatos, verificando a identidade do usuário em cada requisição usando email, senha e hash bcrypt.

---

## `src/middlewares/auth.middleware.ts`

```ts
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
```

---

## Mecanismo de autenticação

Cada requisição às rotas protegidas deve incluir dois headers HTTP:

```http
GET /contacts HTTP/1.1
Host: localhost:3100
email: usuario@exemplo.com
password: minhasenha
```

O middleware valida esses headers em três etapas:

**1. Presença** — ambos os headers devem existir. Se um deles estiver ausente, a requisição é rejeitada com 401 antes de qualquer acesso ao banco.

**2. Identidade** — busca o usuário pelo email. Se não existir, retorna 401 com mensagem genérica.

**3. Autenticidade** — compara a senha enviada com o hash armazenado usando `bcrypt.compare`. Se a senha não bater, retorna 401.

Se todas as três etapas passarem, os dados do usuário são anexados a `request.user` para uso pelos handlers.

---

## Por que a mensagem de erro é genérica?

```ts
reply.status(401).send({ error: "Credenciais inválidas" });
```

Quando o email não é encontrado, a mensagem poderia ser `"Usuário não encontrado"`. Quando a senha está errada, poderia ser `"Senha incorreta"`. Mas ambos os casos retornam a mesma mensagem: **"Credenciais inválidas"**.

Isso é **enumeration prevention** — evitar que um atacante descubra se um email está cadastrado no sistema. Se o sistema retornasse mensagens diferentes para "usuário não existe" e "senha errada", um atacante poderia:
1. Tentar emails aleatórios até receber "senha errada" → sabe que o email existe
2. Aplicar ataque de força bruta apenas nos emails confirmados

Com a mensagem genérica, o atacante não consegue distinguir os dois casos. O mesmo comportamento em ambos os cenários é uma defesa simples e eficaz contra enumeração de usuários.

---

## `bcrypt.compare`

```ts
const passwordValid = await bcrypt.compare(password, user.password);
```

`bcrypt.compare` recebe a senha em texto puro (enviada no header) e o hash armazenado no banco. Internamente, ele:

1. Extrai o salt do hash (o bcrypt inclui o salt no próprio hash)
2. Aplica o mesmo algoritmo de hash à senha com esse salt
3. Compara o resultado com o hash armazenado

O salt é um valor aleatório gerado no momento do hash. Ele garante que dois usuários com a mesma senha tenham hashes diferentes:

```
"senha123" + salt_A → $2a$10$AbCdEf...
"senha123" + salt_B → $2a$10$XyZwVu...
```

Isso inviabiliza ataques de **rainbow table** — tabelas pré-computadas de pares senha→hash. Com salt, o atacante precisaria computar a tabela inteira para cada salt diferente.

**`bcrypt.compare` é assíncrono** — o hashing é computacionalmente intenso por design. Operações síncronas longas bloqueiam o event loop do Node.js, impedindo que outras requisições sejam processadas. Usar `await` mantém o servidor responsivo durante a verificação.

---

## `const userRepository = new UserRepositoryPrisma()`

O repositório é instanciado **uma vez**, no nível do módulo (fora da função do middleware), não dentro da função. Isso é importante:

```ts
// Fora da função — instancia uma vez
const userRepository = new UserRepositoryPrisma();

// Se fosse dentro da função — instancia em CADA requisição
async function authMiddleware(request, reply) {
    const userRepository = new UserRepositoryPrisma(); // nova instância a cada req
}
```

Como `PrismaClient` é um singleton (compartilhado via `prisma-client.ts`), criar múltiplos `UserRepositoryPrisma` não cria conexões extras ao banco. Mas instanciar objetos a cada requisição ainda tem custo de alocação de memória desnecessário. A instância no nível do módulo é criada uma vez e reutilizada.

---

## Extensão de tipos: `src/types/fastify.d.ts`

```ts
import type { } from "fastify";

declare module "fastify" {
    interface FastifyRequest {
        user: {
            id: string;
            email: string;
            role: string;
        } | null;
    }
}
```

Por padrão, `FastifyRequest` não tem a propriedade `user`. Para que `request.user = { id, email, role }` não gere erro de compilação, é necessário **estender** o tipo de `FastifyRequest`.

**Module augmentation** é o mecanismo do TypeScript para adicionar propriedades a tipos de bibliotecas externas sem modificar o código da biblioteca:

```ts
declare module "fastify" {
    interface FastifyRequest {
        user: { ... } | null; // adicionado ao tipo existente
    }
}
```

O `import type { } from "fastify"` no início do arquivo transforma o arquivo em um **módulo** (em oposição a um script ambiente). Módulos têm escopo próprio — `declare module "fastify"` dentro de um módulo faz augmentation. Em um script (sem import/export), seria uma declaração de módulo ambiente completa, substituindo o tipo original.

A augmentation é aplicada globalmente: qualquer arquivo que importe `fastify` receberá o `FastifyRequest` estendido.

**`user: { ... } | null`** — o tipo inclui `null` porque `decorateRequest("user", null)` inicializa o campo como `null`. Antes do middleware executar, o campo é `null`. Após o middleware executar com sucesso, é o objeto com `id`, `email`, `role`.

---

## `app.decorateRequest("user", null)` — `src/server.ts`

```ts
app.decorateRequest("user", null);
```

O Fastify exige que propriedades adicionadas a `request` sejam declaradas com `decorateRequest` antes de serem usadas. Isso serve a dois propósitos:

1. **Performance** — o Fastify pré-aloca o campo em todos os objetos de request, evitando a penalidade de adição dinâmica de propriedades em objetos JavaScript
2. **Clareza** — torna explícito quais campos customizados existem em `request`

Sem `decorateRequest`, o Fastify em modo de desenvolvimento lança um warning. Em produção, pode causar comportamento indefinido dependendo da versão.

O valor inicial `null` corresponde ao tipo `| null` na extensão de tipos — ambos precisam ser consistentes.

---

## Considerações de segurança

### Este mecanismo é adequado para produção?

**Não sem HTTPS.** Enviar senha em headers HTTP (sem criptografia) expõe as credenciais em texto puro para qualquer observador da rede (ISP, proxy, rede local). Este mecanismo **exige TLS/HTTPS** para ser seguro.

Com HTTPS, os headers são encriptados na camada de transporte. A conexão entre cliente e servidor é protegida.

### Alternativa mais robusta: JWT

Para produção, o padrão mais comum é usar **JSON Web Tokens**:

1. Cliente faz `POST /auth/login` com email e senha
2. Servidor verifica as credenciais e emite um token assinado (JWT) com curta validade
3. Cliente inclui o token em requisições subsequentes via header `Authorization: Bearer <token>`
4. Servidor verifica a assinatura do token (sem acessar o banco a cada requisição)

A abordagem com JWT tem vantagens:
- Senha não transita em cada requisição
- Token pode expirar (segurança em caso de interceptação)
- Verificação pode ser feita sem consulta ao banco (stateless)

A abordagem atual (email + senha em headers) é mais simples e didática, adequada para este contexto de aprendizado, mas exige HTTPS obrigatoriamente em qualquer ambiente com dados reais.

### Timing attacks

A implementação atual está sujeita a um **timing attack** teórico: `bcrypt.compare` para uma senha errada pode ser marginalmente mais rápido do que para uma senha correta (o bcrypt aborta comparação ao encontrar diferença). Em prática, o overhead de rede torna isso irrelevante para este contexto.

Implementações de alta segurança usam comparações de tempo constante para eliminar essa variação.
