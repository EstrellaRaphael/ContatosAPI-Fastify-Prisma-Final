# Etapa 3 — Driver Adapter e PrismaClient

## Objetivo

Configurar a conexão com o banco de dados usando a arquitetura de driver adapters do Prisma 7, e criar a instância única do PrismaClient que será compartilhada por toda a aplicação.

---

## A mudança arquitetural do Prisma 7

Versões anteriores do Prisma incluíam drivers de banco de dados embutidos — a conexão com PostgreSQL, MySQL ou SQLite era gerenciada internamente pelo próprio Prisma. No Prisma 7, essa responsabilidade foi separada: o Prisma expõe uma interface (o driver adapter) e drivers externos implementam essa interface.

```
Prisma 6 e anterior:
  PrismaClient → [driver embutido] → Banco

Prisma 7:
  PrismaClient → [adapter interface] → [driver externo] → Banco
```

### Por que essa mudança?

A separação traz flexibilidade real:
- **Edge runtimes** (Cloudflare Workers, Deno Deploy) não suportam drivers nativos. Com adapters, um driver HTTP pode ser usado no lugar
- **Performance** — escolher o driver mais eficiente para cada caso de uso
- **Testabilidade** — adapters podem ser substituídos por mocks em testes

Para o SQLite, o driver escolhido é o `better-sqlite3`, que opera de forma síncrona e tem performance significativamente superior ao driver SQLite anterior do Prisma.

---

## `prisma.config.ts`

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: {
        url: process.env["DATABASE_URL"],
    },
});
```

Este arquivo é usado **exclusivamente pelo CLI do Prisma** — comandos como `prisma migrate dev`, `prisma generate` e `prisma studio`. Ele não é importado pela aplicação em runtime.

**`import "dotenv/config"`** — carrega o arquivo `.env` antes que o Prisma CLI leia `process.env`. Sem isso, `DATABASE_URL` seria `undefined` ao rodar migrations.

**`defineConfig`** — função de configuração com tipo seguro. O TypeScript valida as opções no momento em que você edita o arquivo, não apenas quando o CLI executa.

**`datasource.url: process.env["DATABASE_URL"]`** — o CLI usa esta URL para saber onde está o banco ao rodar migrations. O path `file:./dev.db` no `.env` cria o arquivo de banco relativo à raiz do projeto.

O arquivo é excluído do `tsconfig.json` com `"exclude": ["prisma.config.ts"]` porque usa `import "dotenv/config"` como side-effect puro — padrão que o TypeScript, com `isolatedModules: true`, trata de forma diferente. Como o arquivo não é compilado pela aplicação, excluí-lo é a solução correta.

---

## `src/database/prisma-client.ts`

```ts
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client.js";

const dbUrl = process.env["DATABASE_URL"] ?? "file:./dev.db";
const dbPath = dbUrl.startsWith("file:") ? dbUrl.slice(5) : dbUrl;

const adapter = new PrismaBetterSqlite3({ url: dbPath });

const prisma = new PrismaClient({ adapter });

export default prisma;
```

### Linha por linha

**`import "dotenv/config"`** — garante que `.env` seja carregado antes que `process.env["DATABASE_URL"]` seja lido. Importante: em ES Modules, imports são resolvidos antes do código do módulo executar. Este import está no módulo que é carregado quando a aplicação inicia, então o dotenv roda cedo o suficiente.

**`import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"`** — o adapter que conecta o Prisma ao driver better-sqlite3.

**`import { PrismaClient } from "../generated/prisma/client.js"`** — importa o client gerado pelo `npx prisma generate`, não do `node_modules`. O path aponta para o output customizado definido no schema.

**`const dbUrl = process.env["DATABASE_URL"] ?? "file:./dev.db"`** — com `noUncheckedIndexedAccess: true` no tsconfig, `process.env["DATABASE_URL"]` é `string | undefined`. O operador `??` (nullish coalescing) fornece o valor padrão apenas quando o resultado é `null` ou `undefined` — não para strings vazias.

**`const dbPath = dbUrl.startsWith("file:") ? dbUrl.slice(5) : dbUrl`** — o `better-sqlite3` espera um caminho de arquivo direto, não uma URL com protocolo. `file:./dev.db` → `./dev.db`. O `slice(5)` remove os 5 caracteres do prefixo `"file:"`.

**`const adapter = new PrismaBetterSqlite3({ url: dbPath })`** — instancia o adapter com o caminho do arquivo.

**`const prisma = new PrismaClient({ adapter })`** — cria o cliente Prisma passando o adapter. A partir daí, todo acesso ao banco passa por este objeto.

**`export default prisma`** — exporta a instância única. Todos os repositórios importam este mesmo objeto.

---

## Por que uma instância única?

Criar múltiplas instâncias do PrismaClient em uma mesma aplicação é um erro comum e custoso:

```ts
// Errado — nova conexão a cada operação
async function findUser(id: string) {
    const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3(...) });
    return prisma.user.findUnique({ where: { id } });
}
```

Cada `new PrismaClient()` abre uma nova conexão (ou pool de conexões) com o banco. Em um servidor com centenas de requisições simultâneas, isso esgota rapidamente os recursos disponíveis.

A solução é o padrão **Singleton**: criar o cliente uma única vez e reutilizá-lo. Em Node.js, o sistema de módulos garante isso — um módulo é carregado uma única vez e seu resultado é cacheado. O `export default prisma` aproveita exatamente esse comportamento:

```ts
// user.repository.ts
import prisma from "../database/prisma-client.js"; // sempre a mesma instância

// contact.repository.ts
import prisma from "../database/prisma-client.js"; // mesma instância do cache
```

---

## Fluxo completo de uma query

```
src/server.ts
  └── registra contactRoutes
        └── ContactRepositoryPrisma
              └── import prisma (prisma-client.ts)
                    └── new PrismaClient({ adapter })
                          └── PrismaBetterSqlite3
                                └── better-sqlite3
                                      └── dev.db (arquivo SQLite)
```

A requisição HTTP chega no Fastify → a rota chama o use case → o use case chama o repositório → o repositório usa o Prisma → o Prisma usa o adapter → o adapter lê/escreve no arquivo `.db`.

---

## `prisma.config.ts` vs `prisma-client.ts` — qual a diferença?

| | `prisma.config.ts` | `prisma-client.ts` |
|---|---|---|
| **Usado por** | CLI do Prisma (migrations, generate) | Código da aplicação (runtime) |
| **Executado quando** | `npx prisma ...` | `npm run dev` / produção |
| **Inclui dotenv?** | Sim — CLI não carrega .env automaticamente | Sim — garante que DATABASE_URL está disponível |
| **Faz parte do build?** | Não — excluído do tsconfig | Sim — compilado junto com a aplicação |

São dois arquivos de configuração para dois contextos distintos. O CLI precisa saber onde está o banco para rodar migrations. A aplicação precisa saber onde está o banco para conectar em runtime. Ambos leem do `.env`, mas são separados porque servem a propósitos diferentes.
