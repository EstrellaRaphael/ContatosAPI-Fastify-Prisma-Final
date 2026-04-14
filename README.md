# API de Agenda de Contatos — Fastify + Prisma + TypeScript

API RESTful para gerenciamento de usuários e contatos. Construída com Fastify, Prisma 7 e TypeScript, seguindo os princípios de Clean Architecture, SOLID e boas práticas de desenvolvimento.

---

## Tecnologias

- **Node.js** com ES Modules
- **TypeScript** — tipagem estática com configuração estrita
- **Fastify 5** — framework web focado em performance
- **Prisma 7** — ORM com migrations e client gerado
- **SQLite** — banco de dados em arquivo, sem servidor
- **better-sqlite3** — driver SQLite via Prisma driver adapter
- **bcryptjs** — hash de senhas
- **dotenv** — carregamento de variáveis de ambiente
- **tsx** — execução de TypeScript em desenvolvimento
- **@fastify/swagger** — geração automática de especificação OpenAPI
- **@fastify/swagger-ui** — interface visual interativa em `/docs`

---

## Pré-requisitos

- Node.js 20 ou superior

Nenhum servidor de banco de dados necessário — o SQLite usa um arquivo local gerado automaticamente.

---

## Instalação

```bash
git clone <url-do-repositorio>
cd api-contatos-fastify-prisma
npm install
```

---

## Configuração do banco de dados

Crie um arquivo `.env` na raiz do projeto:

```
DATABASE_URL="file:./dev.db"
```

Em seguida, aplique as migrations e gere o client TypeScript:

```bash
# cria o arquivo dev.db e aplica todas as migrations
npx prisma migrate deploy

# gera o client TypeScript a partir do schema
npx prisma generate
```

Para inspecionar os dados pelo navegador:

```bash
npx prisma studio
```

---

## Rodando o projeto

```bash
# desenvolvimento (com reload automático)
npm run dev
```

Servidor disponível em `http://localhost:3100`.

---

## Endpoints

### Usuários (públicos)

| Método | Rota         | Descrição              |
|--------|--------------|------------------------|
| POST   | /users       | Criar usuário          |
| GET    | /users       | Listar usuários        |
| GET    | /users/:id   | Buscar usuário por ID  |
| PUT    | /users/:id   | Atualizar usuário      |
| DELETE | /users/:id   | Deletar usuário        |

### Contatos (autenticados)

| Método | Rota            | Descrição              |
|--------|-----------------|------------------------|
| POST   | /contacts       | Criar contato          |
| GET    | /contacts       | Listar meus contatos   |
| PUT    | /contacts/:id   | Atualizar contato      |
| DELETE | /contacts/:id   | Deletar contato        |

### Autenticação

As rotas de contatos exigem os headers `email` e `password` em cada requisição:

```http
GET /contacts HTTP/1.1
Host: localhost:3100
email: usuario@exemplo.com
password: minhasenha
```

---

## Estrutura do projeto

```
api-contatos-fastify-prisma/
  prisma/
    schema.prisma           # modelos User e Contact
    migrations/             # histórico de alterações no banco
  src/
    database/
      prisma-client.ts      # instância única do PrismaClient com driver adapter
    errors/
      app-error.ts          # classe AppError para erros controlados
    generated/
      prisma/               # client gerado por npx prisma generate
    interfaces/
      user.interface.ts     # User, UserCreate, UserUpdate, UserRepository
      contact.interface.ts  # Contact, ContactCreate, ContactUpdate, ContactRepository
    middlewares/
      auth.middleware.ts    # autenticação por email + senha com bcrypt
    repositories/
      user.repository.ts    # UserRepositoryPrisma — CRUD de usuários
      contact.repository.ts # ContactRepositoryPrisma — CRUD de contatos
    routes/
      user.routes.ts        # rotas de usuários (Fastify plugin)
      contact.routes.ts     # rotas de contatos com auth (Fastify plugin)
    types/
      fastify.d.ts          # extensão de tipos do Fastify (request.user)
    usecases/
      user.usecase.ts       # regras de negócio de usuários
      contact.usecase.ts    # regras de negócio de contatos
    server.ts               # ponto de entrada — configura e inicia o servidor
  docs/                     # documentação detalhada por etapa de desenvolvimento
  prisma.config.ts          # configuração do Prisma CLI
```

---

## Arquitetura

O projeto segue uma arquitetura em camadas com responsabilidades bem definidas:

```
Requisição HTTP
      ↓
  Routes          ← valida tipos HTTP, delega para UseCase
      ↓
  UseCases        ← aplica regras de negócio, lança AppError
      ↓
  Repositories    ← acessa o banco via Prisma
      ↓
  PrismaClient    ← executa queries no SQLite
```

Cada camada depende apenas da camada imediatamente abaixo, sempre via **interface** — nunca via implementação concreta (Dependency Inversion Principle).

---

## Documentação de desenvolvimento

O diretório [docs/](docs/) contém o registro detalhado de cada etapa:

- [01 — Setup e estrutura](docs/01-setup-e-estrutura.md)
- [02 — Prisma: schema e migrations](docs/02-prisma-schema-e-migrations.md)
- [03 — Driver adapter e PrismaClient](docs/03-driver-adapter-e-cliente.md)
- [04 — Interfaces e repository pattern](docs/04-interfaces-e-repository-pattern.md)
- [05 — Repositórios com Prisma](docs/05-repositorios-com-prisma.md)
- [06 — Use Cases: camada de negócio](docs/06-use-cases-camada-de-negocio.md)
- [07 — Rotas com Fastify](docs/07-rotas-com-fastify.md)
- [08 — Middleware de autenticação](docs/08-middleware-de-autenticacao.md)
- [09 — Tratamento de erros](docs/09-tratamento-de-erros.md)
- [10 — Guia de execução e testes](docs/10-guia-execucao-e-testes.md)
- [11 — Cascade delete](docs/11-cascade-delete.md)
- [12 — RBAC: controle de acesso por papel](docs/12-rbac.md)
- [13 — Documentação automática com Swagger](docs/13-swagger.md)
