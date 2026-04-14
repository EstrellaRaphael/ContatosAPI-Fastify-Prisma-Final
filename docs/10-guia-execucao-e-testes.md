# Etapa 10 — Guia de Execução e Testes

## Objetivo

Guiar a instalação, configuração e execução completa do projeto, cobrindo cada rota e funcionalidade com exemplos reais de requisição, respostas esperadas (sucesso e erro) e explicações do que está acontecendo em cada etapa.

---

## Ferramentas para fazer requisições HTTP

Para testar a API você precisa de uma ferramenta que envie requisições HTTP. As opções mais comuns:

| Ferramenta | Tipo | Quando usar |
|---|---|---|
| **curl** | Terminal | Disponível em qualquer ambiente, bom para scripts |
| **Thunder Client** | VS Code (extensão) | Integrado ao editor, interface visual |
| **Insomnia** | App desktop | Interface rica, fácil de organizar coleções |
| **Postman** | App desktop | Mais completo, ideal para times |
| **Bruno** | App desktop | Open source, arquivos versionáveis |
| **Swagger UI** | Navegador (integrado) | Acessível em `http://localhost:3100/docs` com o servidor rodando — sem instalar nada |

Os exemplos neste guia usam `curl` (funciona no terminal do Windows, Mac e Linux) e também mostram como montar a requisição em ferramentas com interface gráfica.

---

## Parte 1 — Configuração inicial

### Passo 1.1 — Instalar dependências

Abra o terminal na pasta do projeto e execute:

```bash
npm install
```

**O que acontece:** o npm lê o `package.json`, baixa todos os pacotes listados em `dependencies` e `devDependencies` para a pasta `node_modules/`.

**Tempo esperado:** 30 a 60 segundos na primeira vez.

**Como saber que terminou:** o terminal exibe algo como:
```
added 312 packages, and audited 313 packages in 45s
```

---

### Passo 1.2 — Criar o arquivo `.env`

Crie um arquivo chamado `.env` na **raiz do projeto** (no mesmo nível que `package.json`) com o seguinte conteúdo:

```
DATABASE_URL="file:./dev.db"
```

**Por que isso é necessário:** a aplicação lê `DATABASE_URL` para saber onde está o arquivo do banco SQLite. O valor `file:./dev.db` significa "um arquivo chamado `dev.db` na raiz do projeto". Se este arquivo não existir, o Prisma cria automaticamente na próxima etapa.

**Atenção:** o arquivo `.env` não deve ser enviado ao git. Ele já está no `.gitignore`.

---

### Passo 1.3 — Aplicar as migrations

```bash
npx prisma migrate deploy
```

**O que acontece:**
1. O Prisma lê `prisma.config.ts` para encontrar `DATABASE_URL`
2. Lê os arquivos em `prisma/migrations/` em ordem cronológica
3. Cria o arquivo `dev.db` se não existir
4. Executa o SQL de cada migration no banco
5. Cria as tabelas `users` e `contacts`

**Saída esperada:**
```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": SQLite database "dev.db" at "file:./dev.db"

1 migration found in prisma/migrations

The following migration(s) have been applied:
  migrations/
    └─ 20260325005323_init/
      └─ migration.sql

All migrations have been successfully applied.
```

**Se der erro "No migration found":** é necessário criar a migration primeiro. Execute:
```bash
npx prisma migrate dev --name init
```

---

### Passo 1.4 — Gerar o client TypeScript

```bash
npx prisma generate
```

**O que acontece:** o Prisma lê `prisma/schema.prisma` e gera o código TypeScript do client em `src/generated/prisma/`. Este código contém os tipos e a lógica de acesso ao banco específica para os modelos `User` e `Contact`.

**Por que é necessário:** sem executar este comando, a pasta `src/generated/` não existe (está no `.gitignore`) e o `import { PrismaClient } from "../generated/prisma/client.js"` falharia.

**Saída esperada:**
```
Prisma schema loaded from prisma/schema.prisma

✔ Generated Prisma Client to ./src/generated/prisma in 234ms
```

---

### Passo 1.5 — Iniciar o servidor

```bash
npm run dev
```

**O que acontece:** o `tsx` carrega `src/server.ts`, registra os plugins de rotas e inicia o servidor HTTP na porta 3100. O flag `--watch` faz o servidor reiniciar automaticamente ao detectar alterações em qualquer arquivo `.ts`.

**Saída esperada:**
```json
{"level":30,"time":1718000000000,"pid":12345,"hostname":"PC","msg":"Server listening at http://127.0.0.1:3100"}
```

O Fastify usa logs em formato JSON por padrão (com `logger: true`). O campo `"msg"` contém a mensagem principal.

**Servidor pronto em:** `http://localhost:3100`

**Mantenha o servidor rodando** durante todos os testes. Abra uma segunda aba do terminal para executar os comandos `curl`.

---

### Passo 1.6 — Acessar a documentação interativa (Swagger UI)

Com o servidor rodando, abra no navegador:

```
http://localhost:3100/docs
```

A interface exibe todas as rotas organizadas por grupo ("Usuários" e "Contatos"), com formulários para enviar requisições sem precisar de `curl` ou ferramentas externas. Para testar rotas protegidas diretamente pelo Swagger UI:

1. Clique no botão **Authorize** (canto superior direito)
2. Preencha os campos `EmailAuth` e `PasswordAuth` com as credenciais de um usuário admin
3. Clique **Authorize** → **Close**

A partir daí, todas as requisições feitas pelo Swagger UI incluirão os headers de autenticação automaticamente.

**Endpoints adicionais gerados automaticamente:**

| URL | Conteúdo |
|---|---|
| `GET /docs/json` | Especificação OpenAPI em JSON (importável no Postman/Insomnia) |
| `GET /docs/yaml` | Especificação OpenAPI em YAML |

---

## Parte 2 — Testando as rotas de usuários

As rotas de usuários têm **acesso misto**:

| Rota | Acesso |
|---|---|
| `POST /users` | Pública — qualquer um pode criar um usuário |
| `GET /users/:id` | Pública — qualquer um pode buscar um usuário pelo id |
| `GET /users` | **Admin** — exige headers `email` e `password` de um usuário com `role: "admin"` |
| `PUT /users/:id` | **Admin** — exige headers `email` e `password` de um usuário com `role: "admin"` |
| `DELETE /users/:id` | **Admin** — exige headers `email` e `password` de um usuário com `role: "admin"` |

> **Antes de testar rotas admin**, crie um usuário administrador (veja abaixo) e use as credenciais dele nos exemplos de `GET /users`, `PUT /users/:id` e `DELETE /users/:id`.

---

### `POST /users` — Criar usuário

**O que faz:** recebe os dados de um novo usuário, verifica se o email já existe, faz o hash da senha e persiste no banco.

**Requisição:**
```bash
curl -X POST http://localhost:3100/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Silva",
    "email": "joao@email.com",
    "password": "senha123"
  }'
```

> **Thunder Client / Insomnia / Postman:**
> - Método: `POST`
> - URL: `http://localhost:3100/users`
> - Headers: `Content-Type: application/json`
> - Body (JSON):
> ```json
> {
>   "name": "João Silva",
>   "email": "joao@email.com",
>   "password": "senha123"
> }
> ```

**Resposta esperada — HTTP 201 Created:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "João Silva",
  "email": "joao@email.com",
  "role": "user",
  "createdAt": "2026-04-12T10:00:00.000Z",
  "updatedAt": "2026-04-12T10:00:00.000Z"
}
```

**Observe:**
- O campo `password` **não aparece na resposta** — isso é intencional. O `userSelect` no repositório exclui a senha.
- O `id` é um UUID gerado automaticamente.
- O `role` é `"user"` — valor padrão definido no schema.
- `createdAt` e `updatedAt` são preenchidos automaticamente pelo banco.

**Crie um usuário administrador** (necessário para testar as rotas de listagem, atualização e deleção de usuários):
```bash
curl -X POST http://localhost:3100/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Administrador",
    "email": "admin@sistema.com",
    "password": "senhaAdmin123",
    "role": "admin"
  }'
```

Use `admin@sistema.com` / `senhaAdmin123` nos headers das rotas protegidas por admin nos exemplos a seguir.

**Crie um segundo usuário comum** (será usado para testar autenticação de contatos):
```bash
curl -X POST http://localhost:3100/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Maria Souza",
    "email": "maria@email.com",
    "password": "outrasenha456"
  }'
```

---

#### Cenário de erro — Email duplicado

**Requisição** (mesmo email do João):
```bash
curl -X POST http://localhost:3100/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Outro",
    "email": "joao@email.com",
    "password": "qualquercoisa"
  }'
```

**Resposta esperada — HTTP 409 Conflict:**
```json
{
  "error": "Email já está em uso"
}
```

**Por que 409 e não 400?** O status `409 Conflict` é o código semântico correto quando a operação falha porque o estado atual do recurso conflita com a requisição. O email `joao@email.com` já existe — é um conflito de recursos.

---

### `GET /users` — Listar todos os usuários

**O que faz:** retorna todos os usuários cadastrados, sem senha. **Exige autenticação admin.**

**Requisição:**
```bash
curl http://localhost:3100/users \
  -H "email: admin@sistema.com" \
  -H "password: senhaAdmin123"
```

**Resposta esperada — HTTP 200 OK:**
```json
[
  {
    "id": "a1b2c3d4-...",
    "name": "João Silva",
    "email": "joao@email.com",
    "role": "user",
    "createdAt": "2026-04-12T10:00:00.000Z",
    "updatedAt": "2026-04-12T10:00:00.000Z"
  },
  {
    "id": "b2c3d4e5-...",
    "name": "Maria Souza",
    "email": "maria@email.com",
    "role": "user",
    "createdAt": "2026-04-12T10:01:00.000Z",
    "updatedAt": "2026-04-12T10:01:00.000Z"
  }
]
```

Se não houver usuários, retorna um array vazio `[]`.

---

### `GET /users/:id` — Buscar usuário por ID

**O que faz:** retorna um único usuário pelo seu UUID.

Primeiro, copie o `id` retornado na criação do João. Substitua `<ID_DO_JOAO>` pelo UUID real:

**Requisição:**
```bash
curl http://localhost:3100/users/<ID_DO_JOAO>
```

Exemplo com UUID real:
```bash
curl http://localhost:3100/users/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

**Resposta esperada — HTTP 200 OK:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "João Silva",
  "email": "joao@email.com",
  "role": "user",
  "createdAt": "2026-04-12T10:00:00.000Z",
  "updatedAt": "2026-04-12T10:00:00.000Z"
}
```

---

#### Cenário de erro — ID inexistente

```bash
curl http://localhost:3100/users/00000000-0000-0000-0000-000000000000
```

**Resposta esperada — HTTP 404 Not Found:**
```json
{
  "error": "Usuário não encontrado"
}
```

---

### `PUT /users/:id` — Atualizar usuário

**O que faz:** atualiza um ou mais campos de um usuário. Todos os campos são opcionais — apenas os enviados são alterados. **Exige autenticação admin.**

**Requisição** (atualizar apenas o nome):
```bash
curl -X PUT http://localhost:3100/users/<ID_DO_JOAO> \
  -H "Content-Type: application/json" \
  -H "email: admin@sistema.com" \
  -H "password: senhaAdmin123" \
  -d '{
    "name": "João Silva Atualizado"
  }'
```

**Resposta esperada — HTTP 200 OK:**
```json
{
  "id": "a1b2c3d4-...",
  "name": "João Silva Atualizado",
  "email": "joao@email.com",
  "role": "user",
  "createdAt": "2026-04-12T10:00:00.000Z",
  "updatedAt": "2026-04-12T10:05:00.000Z"
}
```

**Observe:** o campo `updatedAt` foi atualizado automaticamente pelo Prisma.

**Atualização de senha** (a nova senha é automaticamente hashada):
```bash
curl -X PUT http://localhost:3100/users/<ID_DO_JOAO> \
  -H "Content-Type: application/json" \
  -H "email: admin@sistema.com" \
  -H "password: senhaAdmin123" \
  -d '{
    "password": "novasenha789"
  }'
```

Após isso, as requisições autenticadas devem usar `novasenha789`.

---

#### Cenário de erro — ID inexistente

```bash
curl -X PUT http://localhost:3100/users/00000000-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -H "email: admin@sistema.com" \
  -H "password: senhaAdmin123" \
  -d '{ "name": "Qualquer" }'
```

**Resposta esperada — HTTP 404 Not Found:**
```json
{
  "error": "Usuário não encontrado"
}
```

---

### `DELETE /users/:id` — Deletar usuário

**O que faz:** remove permanentemente o usuário do banco. **Todos os contatos do usuário são deletados automaticamente em cascata.** **Exige autenticação admin.**

**Requisição:**
```bash
curl -X DELETE http://localhost:3100/users/<ID_DA_MARIA> \
  -H "email: admin@sistema.com" \
  -H "password: senhaAdmin123"
```

**Resposta esperada — HTTP 200 OK:**
```json
{
  "id": "b2c3d4e5-...",
  "name": "Maria Souza",
  "email": "maria@email.com",
  "role": "user",
  "createdAt": "2026-04-12T10:01:00.000Z",
  "updatedAt": "2026-04-12T10:01:00.000Z"
}
```

A resposta contém os dados do usuário **que foi deletado** — útil para confirmar que o objeto correto foi removido e para possível exibição de confirmação na interface.

> **Nota:** não é necessário deletar os contatos do usuário antes — o banco remove todos os contatos vinculados automaticamente na mesma transação (cascade delete configurado no schema Prisma).

---

## Parte 3 — Testando as rotas de contatos

As rotas de contatos são **protegidas** — exigem autenticação via headers `email` e `password` em **todas** as requisições.

Antes de continuar, certifique-se de que:
- O usuário João existe no banco
- Você tem o email (`joao@email.com`) e a senha atual (se atualizou, use a nova)

---

### Como incluir autenticação

Em todas as requisições de contatos, inclua os headers:
```
email: joao@email.com
password: senha123
```

No `curl`, use o flag `-H` para cada header:
```bash
curl http://localhost:3100/contacts \
  -H "email: joao@email.com" \
  -H "password: senha123"
```

---

### `POST /contacts` — Criar contato

**O que faz:** cria um contato vinculado ao usuário autenticado. O `userId` é extraído automaticamente da autenticação — o cliente não precisa (nem pode) informar.

**Requisição:**
```bash
curl -X POST http://localhost:3100/contacts \
  -H "Content-Type: application/json" \
  -H "email: joao@email.com" \
  -H "password: senha123" \
  -d '{
    "name": "Contato Um",
    "phone": "11999990001"
  }'
```

**Resposta esperada — HTTP 201 Created:**
```json
{
  "id": "c3d4e5f6-...",
  "name": "Contato Um",
  "email": null,
  "phone": "11999990001",
  "createdAt": "2026-04-12T10:10:00.000Z",
  "updatedAt": "2026-04-12T10:10:00.000Z",
  "userId": "a1b2c3d4-..."
}
```

**Observe:**
- O campo `email` é `null` — foi omitido na requisição e o campo é nullable no banco.
- O `userId` corresponde ao id do João — preenchido automaticamente pela autenticação.

**Criar contato com email:**
```bash
curl -X POST http://localhost:3100/contacts \
  -H "Content-Type: application/json" \
  -H "email: joao@email.com" \
  -H "password: senha123" \
  -d '{
    "name": "Contato Dois",
    "phone": "11999990002",
    "email": "contato2@email.com"
  }'
```

**Criar mais um contato** (para testar listagem):
```bash
curl -X POST http://localhost:3100/contacts \
  -H "Content-Type: application/json" \
  -H "email: joao@email.com" \
  -H "password: senha123" \
  -d '{
    "name": "Contato Três",
    "phone": "11999990003"
  }'
```

---

#### Cenários de erro de autenticação

**Sem headers:**
```bash
curl -X POST http://localhost:3100/contacts \
  -H "Content-Type: application/json" \
  -d '{ "name": "Teste", "phone": "11999990000" }'
```

**Resposta — HTTP 401 Unauthorized:**
```json
{
  "error": "Credenciais obrigatórias: forneça os headers 'email' e 'password'"
}
```

**Email inexistente:**
```bash
curl -X POST http://localhost:3100/contacts \
  -H "Content-Type: application/json" \
  -H "email: naoexiste@email.com" \
  -H "password: qualquercoisa" \
  -d '{ "name": "Teste", "phone": "11999990000" }'
```

**Resposta — HTTP 401 Unauthorized:**
```json
{
  "error": "Credenciais inválidas"
}
```

**Senha errada:**
```bash
curl -X POST http://localhost:3100/contacts \
  -H "Content-Type: application/json" \
  -H "email: joao@email.com" \
  -H "password: senhaerrada" \
  -d '{ "name": "Teste", "phone": "11999990000" }'
```

**Resposta — HTTP 401 Unauthorized:**
```json
{
  "error": "Credenciais inválidas"
}
```

**Observe:** email inexistente e senha errada retornam a **mesma mensagem**. Isso é intencional — evita que um atacante descubra se um email está cadastrado no sistema.

---

### `GET /contacts` — Listar contatos do usuário autenticado

**O que faz:** retorna apenas os contatos pertencentes ao usuário autenticado — não todos os contatos do sistema.

**Requisição:**
```bash
curl http://localhost:3100/contacts \
  -H "email: joao@email.com" \
  -H "password: senha123"
```

**Resposta esperada — HTTP 200 OK:**
```json
[
  {
    "id": "c3d4e5f6-...",
    "name": "Contato Um",
    "email": null,
    "phone": "11999990001",
    "createdAt": "2026-04-12T10:10:00.000Z",
    "updatedAt": "2026-04-12T10:10:00.000Z",
    "userId": "a1b2c3d4-..."
  },
  {
    "id": "d4e5f6g7-...",
    "name": "Contato Dois",
    "email": "contato2@email.com",
    "phone": "11999990002",
    "createdAt": "2026-04-12T10:11:00.000Z",
    "updatedAt": "2026-04-12T10:11:00.000Z",
    "userId": "a1b2c3d4-..."
  },
  {
    "id": "e5f6g7h8-...",
    "name": "Contato Três",
    "email": null,
    "phone": "11999990003",
    "createdAt": "2026-04-12T10:12:00.000Z",
    "updatedAt": "2026-04-12T10:12:00.000Z",
    "userId": "a1b2c3d4-..."
  }
]
```

**Isolamento de dados:** cada usuário vê apenas seus próprios contatos. Se você criar um segundo usuário e listar os contatos dele, a lista será vazia ou conterá apenas os contatos dele — os contatos do João não aparecem.

---

### `PUT /contacts/:id` — Atualizar contato

**O que faz:** atualiza os dados de um contato. O contato deve pertencer ao usuário autenticado.

Copie o `id` de um dos contatos criados. Substitua `<ID_DO_CONTATO>`:

**Atualizar nome e phone:**
```bash
curl -X PUT http://localhost:3100/contacts/<ID_DO_CONTATO> \
  -H "Content-Type: application/json" \
  -H "email: joao@email.com" \
  -H "password: senha123" \
  -d '{
    "name": "Contato Um Atualizado",
    "phone": "11888880001"
  }'
```

**Resposta esperada — HTTP 200 OK:**
```json
{
  "id": "c3d4e5f6-...",
  "name": "Contato Um Atualizado",
  "email": null,
  "phone": "11888880001",
  "createdAt": "2026-04-12T10:10:00.000Z",
  "updatedAt": "2026-04-12T10:15:00.000Z",
  "userId": "a1b2c3d4-..."
}
```

**Adicionar email a um contato que não tinha:**
```bash
curl -X PUT http://localhost:3100/contacts/<ID_DO_CONTATO> \
  -H "Content-Type: application/json" \
  -H "email: joao@email.com" \
  -H "password: senha123" \
  -d '{
    "email": "contato1novo@email.com"
  }'
```

**Remover o email de um contato (setar para null):**
```bash
curl -X PUT http://localhost:3100/contacts/<ID_DO_CONTATO> \
  -H "Content-Type: application/json" \
  -H "email: joao@email.com" \
  -H "password: senha123" \
  -d '{
    "email": null
  }'
```

**Resposta:** o campo `email` na resposta será `null`.

---

#### Cenário de erro — Contato inexistente

```bash
curl -X PUT http://localhost:3100/contacts/00000000-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -H "email: joao@email.com" \
  -H "password: senha123" \
  -d '{ "name": "Qualquer" }'
```

**Resposta — HTTP 404 Not Found:**
```json
{
  "error": "Contato não encontrado"
}
```

---

#### Cenário de erro — Contato de outro usuário

Este é um dos testes mais importantes — verifica que um usuário não pode modificar os contatos de outro.

**Passo 1:** crie um segundo usuário:
```bash
curl -X POST http://localhost:3100/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pedro Costa",
    "email": "pedro@email.com",
    "password": "senhadopedro"
  }'
```

**Passo 2:** crie um contato do Pedro:
```bash
curl -X POST http://localhost:3100/contacts \
  -H "Content-Type: application/json" \
  -H "email: pedro@email.com" \
  -H "password: senhadopedro" \
  -d '{
    "name": "Contato do Pedro",
    "phone": "11777770001"
  }'
```

**Passo 3:** tente atualizar o contato do Pedro **autenticado como João**:
```bash
curl -X PUT http://localhost:3100/contacts/<ID_DO_CONTATO_DO_PEDRO> \
  -H "Content-Type: application/json" \
  -H "email: joao@email.com" \
  -H "password: senha123" \
  -d '{ "name": "Tentativa de invasão" }'
```

**Resposta esperada — HTTP 403 Forbidden:**
```json
{
  "error": "Acesso negado"
}
```

**Por que 403 e não 401?**
- `401 Unauthorized` significa "não sei quem você é — autentique-se"
- `403 Forbidden` significa "sei quem você é, mas você não tem permissão sobre este recurso"

O João está autenticado (a credencial é válida), mas o contato pertence ao Pedro. O acesso é negado por motivo de **autorização** (403), não de **autenticação** (401).

---

### `DELETE /contacts/:id` — Deletar contato

**O que faz:** remove permanentemente um contato. O contato deve pertencer ao usuário autenticado.

**Requisição:**
```bash
curl -X DELETE http://localhost:3100/contacts/<ID_DO_CONTATO> \
  -H "email: joao@email.com" \
  -H "password: senha123"
```

**Resposta esperada — HTTP 200 OK:**
```json
{
  "id": "c3d4e5f6-...",
  "name": "Contato Um Atualizado",
  "email": null,
  "phone": "11888880001",
  "createdAt": "2026-04-12T10:10:00.000Z",
  "updatedAt": "2026-04-12T10:15:00.000Z",
  "userId": "a1b2c3d4-..."
}
```

A resposta retorna os dados do contato deletado — os dados são retornados antes de serem removidos do banco.

---

#### Cenário de erro — Deletar contato de outro usuário

```bash
curl -X DELETE http://localhost:3100/contacts/<ID_DO_CONTATO_DO_PEDRO> \
  -H "email: joao@email.com" \
  -H "password: senha123"
```

**Resposta — HTTP 403 Forbidden:**
```json
{
  "error": "Acesso negado"
}
```

---

## Parte 4 — Inspecionando o banco de dados

O Prisma oferece uma interface web para visualizar e editar os dados diretamente.

**Com o servidor parado** (ou em outro terminal), execute:

```bash
npx prisma studio
```

**O que acontece:** o Prisma Studio abre em `http://localhost:5555`. Você verá as tabelas `User` e `Contact` com todos os dados persistidos.

**O que verificar:**
- Os usuários criados estão na tabela `User`
- A coluna `password` mostra o hash bcrypt (`$2a$10$...`), nunca a senha em texto puro
- Os contatos têm o `userId` correto apontando para o usuário dono
- Contatos deletados não aparecem mais

---

## Parte 5 — Fluxo completo de teste

Execute este fluxo do início ao fim para validar todas as funcionalidades em sequência:

### Sequência recomendada

```
0. POST /users          → criar usuário admin (role: "admin") — necessário para rotas admin
1. POST /users          → criar usuário "Ana" (role: "user")
2. POST /users          → criar usuário "Bruno" (role: "user")
3. GET  /users          → confirmar que todos aparecem (autenticado como admin)
4. GET  /users/:id      → buscar "Ana" pelo id (público)
5. PUT  /users/:id      → atualizar nome da "Ana" (autenticado como admin)
6. POST /contacts       → criar 2 contatos autenticado como "Ana"
7. POST /contacts       → criar 1 contato autenticado como "Bruno"
8. GET  /contacts       → listar contatos de "Ana" (deve mostrar apenas os 2 dela)
9. GET  /contacts       → listar contatos de "Bruno" (deve mostrar apenas o dele)
10. PUT  /contacts/:id  → atualizar contato de "Ana" autenticado como "Ana" (sucesso)
11. PUT  /contacts/:id  → atualizar contato de "Ana" autenticado como "Bruno" (deve dar 403)
12. DELETE /contacts/:id → deletar contato de "Ana" autenticado como "Ana" (sucesso)
13. GET  /contacts       → confirmar que a lista de "Ana" tem 1 contato agora
14. DELETE /users/:id    → deletar "Bruno" autenticado como admin (contatos de Bruno deletados automaticamente em cascata)
15. GET  /users          → confirmar que só admin e "Ana" aparecem
```

---

## Parte 6 — Tabela de referência rápida

### Usuários

| Método | Endpoint | Body | Auth | Sucesso | Erro |
|---|---|---|---|---|---|
| `POST` | `/users` | `{name, email, password, role?}` | Não | `201` usuário criado | `409` email duplicado |
| `GET` | `/users` | — | **Admin** | `200` array de usuários | `401` sem credenciais / `403` sem permissão |
| `GET` | `/users/:id` | — | Não | `200` usuário | `404` não encontrado |
| `PUT` | `/users/:id` | `{name?, email?, password?, role?}` | **Admin** | `200` usuário atualizado | `401` / `403` / `404` não encontrado |
| `DELETE` | `/users/:id` | — | **Admin** | `200` usuário deletado (contatos em cascata) | `401` / `403` / `404` não encontrado |

### Contatos

| Método | Endpoint | Body | Auth | Sucesso | Erro |
|---|---|---|---|---|---|
| `POST` | `/contacts` | `{name, phone, email?}` | Sim | `201` contato criado | `401` sem credenciais |
| `GET` | `/contacts` | — | Sim | `200` array de contatos | `401` sem credenciais |
| `PUT` | `/contacts/:id` | `{name?, phone?, email?}` | Sim | `200` contato atualizado | `403` não é dono / `404` não existe |
| `DELETE` | `/contacts/:id` | — | Sim | `200` contato deletado | `403` não é dono / `404` não existe |

### Headers de autenticação

**Rotas de contatos** (qualquer usuário autenticado):
```
email: <email-do-usuario>
password: <senha-em-texto-puro>
```

**Rotas admin** (`GET /users`, `PUT /users/:id`, `DELETE /users/:id`):
```
email: <email-de-usuario-com-role-admin>
password: <senha-em-texto-puro>
```

### Formato de erro (todos os erros)

```json
{
  "error": "mensagem descritiva do erro"
}
```

---

## Parte 7 — Problemas comuns e soluções

### "Cannot find module '../generated/prisma/client.js'"

**Causa:** `npx prisma generate` não foi executado, ou a pasta `src/generated/` está no gitignore e não foi gerada.

**Solução:**
```bash
npx prisma generate
```

---

### "The table `main.users` does not exist"

**Causa:** as migrations não foram aplicadas.

**Solução:**
```bash
npx prisma migrate deploy
# ou, em desenvolvimento:
npx prisma migrate dev --name init
```

---

### "Environment variable not found: DATABASE_URL"

**Causa:** o arquivo `.env` não existe ou está no lugar errado.

**Solução:** crie o arquivo `.env` na raiz do projeto (no mesmo nível que `package.json`) com:
```
DATABASE_URL="file:./dev.db"
```

---

### Servidor não reinicia após alterar um arquivo

**Causa:** o servidor não foi iniciado com `npm run dev` (que usa `--watch`).

**Solução:** pare o servidor (`Ctrl+C`) e reinicie com:
```bash
npm run dev
```

---

### "address already in use :::3100"

**Causa:** já existe um processo rodando na porta 3100 (provavelmente outra instância do servidor).

**Solução:** identifique e encerre o processo:
```bash
# Windows
netstat -ano | findstr :3100
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:3100 | xargs kill
```

---

### HTTP 403 ao acessar `GET /users`, `PUT /users/:id` ou `DELETE /users/:id`

**Causa:** a rota exige `role: "admin"` e o usuário autenticado tem `role: "user"`.

**Solução:** use as credenciais de um usuário criado com `"role": "admin"`. Se ainda não existe um admin, crie:
```bash
curl -X POST http://localhost:3100/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Administrador",
    "email": "admin@sistema.com",
    "password": "senhaAdmin123",
    "role": "admin"
  }'
```

---

### Swagger UI não abre em `http://localhost:3100/docs`

**Causa:** o servidor não está rodando ou foi iniciado antes das dependências serem instaladas.

**Solução:** confirme que `npm run dev` está ativo no terminal. Se necessário, pare (`Ctrl+C`) e reinicie.
