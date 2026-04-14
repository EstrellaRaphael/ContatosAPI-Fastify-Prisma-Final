# Etapa 14 — Migração de SQLite para MySQL

## Objetivo

Substituir o banco de dados SQLite por MySQL, ajustando o provider do Prisma, a string de conexão, os scripts SQL e a versão do Prisma — documentando cada decisão técnica tomada no processo, incluindo uma limitação encontrada no Prisma 7 que forçou um downgrade para a versão 6.

---

## Por que trocar de banco?

O SQLite é ideal para desenvolvimento e testes locais: não requer instalação de servidor, armazena tudo em um único arquivo e funciona sem configuração. Essas mesmas características o tornam inadequado para ambientes de produção:

| Característica | SQLite | MySQL |
|---|---|---|
| Servidor dedicado | Não — arquivo local | Sim — processo independente |
| Concorrência | Limitada (lock de arquivo) | Alta (lock por linha/tabela) |
| Usuários simultâneos | Poucos | Muitos |
| Tipos de dado | Genéricos (`TEXT`, `INTEGER`) | Específicos (`VARCHAR`, `INT`, `DATETIME`) |
| Uso em produção | Não recomendado | Padrão da indústria |

A troca de SQLite para MySQL é o passo natural quando um projeto educacional precisa se aproximar de um ambiente real.

---

## O problema com o Prisma 7 e MySQL

O projeto usava o **Prisma 7**, que introduziu uma mudança arquitetural significativa: todos os bancos de dados passaram a exigir um **driver adapter** — um módulo separado que faz a ponte entre o PrismaClient e o banco.

No Prisma 7, o `PrismaClient` não aceita mais `new PrismaClient()` sem argumentos. O construtor exige obrigatoriamente um `adapter` ou `accelerateUrl`:

```ts
// Prisma 7 — sempre exige adapter
new PrismaClient({ adapter: new PrismaBetterSqlite3(...) })  // SQLite ✓
new PrismaClient({ adapter: new PrismaPg(...) })             // PostgreSQL ✓
new PrismaClient()                                           // ✗ erro de compilação
```

O adapter para SQLite (`@prisma/adapter-better-sqlite3`) já existia. Para MySQL, o adapter equivalente seria `@prisma/adapter-mysql2` — mas **ele não foi publicado no npm na versão 7**. Confirmar:

```bash
npm info @prisma/adapter-mysql2
# → 404 Not Found
```

O Prisma 7 com gerador `prisma-client` gera um `PrismaClientOptions` que só aceita `adapter` ou `accelerateUrl`:

```ts
// Gerado pelo Prisma 7 — src/generated/prisma/internal/prismaNamespace.ts
export type PrismaClientOptions = ({
  adapter: runtime.SqlDriverAdapterFactory  // obrigatório
  accelerateUrl?: never
} | {
  accelerateUrl: string                     // ou isso
  adapter?: never
}) & { ... }
```

Mesmo trocando para o gerador legado `prisma-client-js` com output customizado, o Prisma 7 gera o mesmo tipo — a restrição é da versão, não do gerador.

### Por que não usar o adapter PlanetScale para MySQL?

O `@prisma/adapter-planetscale` usa o protocolo HTTP da PlanetScale — não conecta a um servidor MySQL local via TCP. Exigiria uma conta em nuvem e não se aplica ao cenário de desenvolvimento local.

### Conclusão: downgrade para Prisma 6

O Prisma 6 oferece suporte nativo ao MySQL via engine binário. Com o gerador `prisma-client-js` **sem output customizado**, o client é gerado em `node_modules/@prisma/client` e `new PrismaClient()` funciona sem adapter — a conexão é lida diretamente de `DATABASE_URL`.

---

## Arquivos alterados

### `prisma/schema.prisma`

**Antes (Prisma 7 + SQLite):**
```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "sqlite"
}
```

**Depois (Prisma 6 + MySQL):**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

**Três mudanças simultâneas:**

1. **`provider = "prisma-client"` → `"prisma-client-js"`** — o gerador `prisma-client` é exclusivo do Prisma 7 WASM. O `prisma-client-js` usa o engine binário tradicional, compatível com MySQL no Prisma 6.

2. **`output` removido** — com `prisma-client-js` sem output customizado, o client é gerado em `node_modules/@prisma/client`. Com output customizado, o Prisma 6 ainda gera o tipo WASM que exige adapter. Sem output, gera o tipo tradicional que aceita `new PrismaClient()`.

3. **`provider = "sqlite"` → `"mysql"` + `url = env("DATABASE_URL")`** — o provider instrui o Prisma sobre qual dialeto SQL usar. A `url` era omitida no SQLite do Prisma 7 porque a URL era passada para o adapter em `prisma.config.ts`; no Prisma 6 ela é lida diretamente do ambiente pelo schema.

---

### `package.json`

```json
// Antes
"prisma": "^7.5.0"
"@prisma/client": "^7.6.0"

// Depois
"prisma": "^6.0.0"
"@prisma/client": "^6.0.0"
```

O `prisma` (devDependency) é a CLI — usada para `migrate`, `generate`, `studio`. O `@prisma/client` (dependency) é o pacote de runtime importado pela aplicação. Ambos precisam ser da mesma versão maior para garantir compatibilidade entre o client gerado e o runtime.

---

### `prisma.config.ts`

**Antes:**
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

**Depois:**
```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
});
```

O bloco `datasource.url` foi removido. No Prisma 7, a URL de conexão para os comandos CLI (migrate, studio) era passada via `prisma.config.ts` porque o `schema.prisma` não suportava mais a propriedade `url` no datasource. No Prisma 6, o `schema.prisma` é a fonte de verdade para a URL — o `prisma.config.ts` é lido apenas para localizar o schema e as migrations.

---

### `src/database/prisma-client.ts`

**Antes (com adapter SQLite):**
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

**Depois (MySQL nativo):**
```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default prisma;
```

Três remoções:

1. **`import "dotenv/config"`** — não é mais necessário aqui. O `prisma.config.ts` já carrega o dotenv para os comandos CLI. Em runtime, o `DATABASE_URL` é lido diretamente pelo engine binário do Prisma 6, que nativa-mente busca variáveis de ambiente.

2. **Adapter e lógica de path** — sem adapter, não há necessidade de extrair o caminho do arquivo da URL. O engine binário do MySQL recebe a URL completa.

3. **Import de `../generated/prisma/client.js` → `@prisma/client`** — como o output customizado foi removido do schema, o client agora vive em `node_modules/@prisma/client`. Importar do caminho anterior causaria erro de módulo não encontrado.

---

### `.env`

**Antes (SQLite):**
```
DATABASE_URL="file:./dev.db"
```

**Depois (MySQL):**
```
DATABASE_URL="mysql://root:@localhost:3306/contatos_db"
```

**Formato da connection string MySQL:**
```
mysql://<usuario>:<senha>@<host>:<porta>/<banco>
```

| Parte | Valor | Significado |
|---|---|---|
| `mysql://` | protocolo | indica driver MySQL |
| `root` | usuário | usuário do servidor MySQL |
| `:` | separador | senha vazia — nenhum caractere entre `:` e `@` |
| `@localhost` | host | servidor rodando na máquina local |
| `:3306` | porta | porta padrão do MySQL |
| `/contatos_db` | banco | nome do banco de dados |

---

## Scripts SQL manuais

Além das migrations do Prisma, foram criados dois scripts para uso no MySQL Workbench:

### `sql/01-create.sql` — Criação das tabelas

Cria o banco e as tabelas com os tipos corretos do MySQL. Os tipos diferem do SQLite:

| Campo | SQLite (antes) | MySQL (depois) | Motivo |
|---|---|---|---|
| `id` | `TEXT NOT NULL PRIMARY KEY` | `VARCHAR(36) NOT NULL` | MySQL não usa `TEXT` como PK diretamente |
| `createdAt` | `DATETIME NOT NULL` | `DATETIME(3) NOT NULL` | `(3)` = precisão de milissegundos |
| Identificadores | `"coluna"` (aspas duplas) | `` `coluna` `` (backticks) | Dialeto MySQL usa backticks |
| Constraint | inline no `PRIMARY KEY` | `CONSTRAINT ... FOREIGN KEY` | MySQL separa a definição da constraint |

O `ENGINE=InnoDB` é obrigatório para suporte a foreign keys no MySQL — o engine `MyISAM` (legado) não suporta constraints de FK.

O `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci` garante suporte completo a Unicode, incluindo emojis e caracteres especiais em nomes.

### `sql/02-seed.sql` — Dados de exemplo

Popula o banco com 4 usuários e 6 contatos para testes. As senhas são hashes bcrypt reais gerados pelo próprio `bcryptjs` do projeto:

```bash
node -e "import('bcryptjs').then(({ default: b }) => b.hash('senha123', 10).then(console.log))"
```

O script desativa temporariamente o safe update mode do MySQL Workbench:

```sql
SET SQL_SAFE_UPDATES = 0;
DELETE FROM `contacts`;
DELETE FROM `users`;
SET SQL_SAFE_UPDATES = 1;
```

O safe update mode bloqueia `DELETE` e `UPDATE` sem cláusula `WHERE` em coluna-chave — uma proteção do MySQL Workbench contra limpezas acidentais. Para o script de seed, que limpa toda a tabela intencionalmente antes de reinserir, é necessário desativar temporariamente.

**Usuários inseridos:**

| Nome | Email | Senha | Role |
|---|---|---|---|
| Administrador | `admin@sistema.com` | `senhaAdmin123` | admin |
| João Silva | `joao@email.com` | `senha123` | user |
| Maria Souza | `maria@email.com` | `senha456` | user |
| Pedro Costa | `pedro@email.com` | `senha789` | user |

---

## Migration do Prisma

A migration gerada pelo Prisma 6 para MySQL produz SQL diferente da migration SQLite anterior. A migration SQLite existente foi **apagada** antes de gerar a nova — ela era incompatível por três razões:

1. **Sintaxe de tipos** — `TEXT NOT NULL PRIMARY KEY` é válido em SQLite mas não em MySQL
2. **Identificadores** — SQLite aceita aspas duplas (`"coluna"`), MySQL usa backticks
3. **Constraints** — SQLite define FK inline com `CONSTRAINT ... FOREIGN KEY`; MySQL usa sintaxe separada

Para gerar a migration MySQL:

```bash
npx prisma migrate dev --name init
```

**O que acontece:**

1. O Prisma lê `DATABASE_URL` do `.env` via `prisma.config.ts`
2. Conecta ao servidor MySQL em `localhost:3306`
3. Lê o `schema.prisma` e gera o SQL equivalente em dialeto MySQL
4. Cria o arquivo `prisma/migrations/<timestamp>_init/migration.sql`
5. Executa o SQL no banco
6. Registra a migration na tabela `_prisma_migrations` (criada automaticamente)

**Saída esperada:**
```
Prisma schema loaded from prisma\schema.prisma
Datasource "db": MySQL database "contatos_db" at "localhost:3306"

Applying migration `20260414_init`

The following migration(s) have been applied:
  migrations/
    └─ 20260414_init/
      └─ migration.sql

Your database is now in sync with your schema.
```

---

## Diferença entre migration do Prisma e scripts SQL manuais

Este projeto usa **ambas as abordagens** para fins diferentes:

| | Migration Prisma | Scripts `sql/` |
|---|---|---|
| **Quem usa** | Prisma CLI | MySQL Workbench |
| **Quando usar** | Deploy, desenvolvimento, CI/CD | Demonstração, setup manual, cursos |
| **Versionamento** | Automático (pasta `migrations/`) | Manual |
| **Dados** | Apenas estrutura | Estrutura + dados de exemplo |
| **Rastreia histórico** | Sim (`_prisma_migrations`) | Não |

Em produção real, usa-se apenas as migrations do Prisma. Os scripts `sql/` existem para facilitar a criação manual do banco em ambientes onde o Prisma CLI não está disponível (como um banco de dados de demonstração ou avaliação).

---

## Fluxo completo de setup com MySQL

```
1. Criar o banco no MySQL Workbench
   └── Executar sql/01-create.sql

2. Popular com dados de exemplo (opcional)
   └── Executar sql/02-seed.sql

3. Configurar o .env
   └── DATABASE_URL="mysql://root:@localhost:3306/contatos_db"

4. Instalar dependências
   └── npm install

5. Aplicar migrations
   └── npx prisma migrate dev --name init

6. Iniciar o servidor
   └── npm run dev
```

> **Atenção:** se você executou os scripts SQL manuais (passo 1 e 2) e depois rodou `npx prisma migrate dev`, as tabelas já existem. O Prisma vai registrar a migration como aplicada sem recriar as tabelas — o comportamento é correto.
