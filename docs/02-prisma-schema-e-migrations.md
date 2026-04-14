# Etapa 2 — Prisma: Schema e Migrations

## Objetivo

Definir os modelos de dados da aplicação usando o Prisma Schema Language e criar o histórico de migrations que evolui o banco de dados de forma controlada e reproduzível.

---

## O que é o Prisma?

Prisma é um ORM (Object-Relational Mapper) moderno para Node.js e TypeScript. Ele resolve três problemas que aparecem cedo em projetos com banco de dados:

**1. SQL manual é verboso e propenso a erros:**
```ts
// Sem Prisma — SQL manual
db.query(
    "INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
    [id, name, email, hashedPassword, "user"]
);
// Qualquer erro de nome de coluna só aparece em tempo de execução
```

**2. Sem tipagem nos resultados:**
```ts
const user = await db.query("SELECT * FROM users WHERE id = ?", [id]);
user.nmae; // TypeScript não detecta — "nmae" em vez de "name"
```

**3. Sem histórico de alterações no banco:**
Quando o schema muda, como garantir que todos os ambientes (dev, staging, produção) estão sincronizados?

O Prisma resolve os três: gera um client TypeScript tipado a partir do schema, e mantém um histórico de migrations que pode ser aplicado em qualquer ambiente.

---

## `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "sqlite"
}

model User {
  id        String    @id @default(uuid())
  name      String
  email     String    @unique
  password  String
  role      String    @default("user")
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  contacts  Contact[]

  @@map("users")
}

model Contact {
  id        String   @id @default(uuid())
  name      String
  email     String?
  phone     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  userId    String

  user User @relation(fields: [userId], references: [id])

  @@map("contacts")
}
```

---

## Seção `generator client`

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
```

**`provider = "prisma-client"`** — usa o novo gerador do Prisma 7, que produz um client moderno com suporte nativo a driver adapters. Versões anteriores usavam `"prisma-client-js"`.

**`output = "../src/generated/prisma"`** — define onde o client TypeScript gerado será criado. O caminho é relativo ao diretório `prisma/`, por isso os dois `..` para subir um nível.

Usar um path explícito em `src/generated/` em vez do padrão (`node_modules/@prisma/client`) tem vantagens:
- O client é tratado como parte do projeto, não como dependência externa
- Fica claro que foi gerado especificamente para este schema
- Facilita inspecionar os tipos gerados durante o desenvolvimento

O diretório `src/generated/` é adicionado ao `.gitignore` porque é reproduzível com `npx prisma generate`.

---

## Seção `datasource db`

```prisma
datasource db {
  provider = "sqlite"
}
```

Define o banco de dados. `provider = "sqlite"` usa um arquivo local — sem servidor, sem instalação, ideal para desenvolvimento. O caminho do arquivo (`DATABASE_URL`) é fornecido pelo `prisma.config.ts` via variável de ambiente, não hardcoded no schema.

Essa separação entre provider e URL é intencional: o schema define **o tipo** de banco, o ambiente define **onde** ele está.

---

## Modelo `User`

```prisma
model User {
  id        String    @id @default(uuid())
  name      String
  email     String    @unique
  password  String
  role      String    @default("user")
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  contacts  Contact[]

  @@map("users")
}
```

### Decisões de design

**`id String @id @default(uuid())`** — UUID como chave primária ao invés de inteiro auto-incremento. UUIDs são globalmente únicos e não sequenciais, o que traz benefícios:
- Não revelam o volume de dados (um id `5` revela que existem ~5 usuários)
- Podem ser gerados no cliente antes de chegar ao banco
- Não criam dependência de ordem de inserção em operações distribuídas

**`email String @unique`** — garante unicidade no nível do banco, não apenas na aplicação. Mesmo que o código falhe em verificar duplicatas, o banco rejeita o insert. Defesa em profundidade.

**`password String`** — armazena apenas o hash bcrypt, nunca a senha em texto puro. A responsabilidade de fazer o hash fica no repositório, garantindo que nenhum código possa persistir senha sem hashing.

**`role String @default("user")`** — o papel do usuário no sistema. O default `"user"` significa que toda criação de conta resulta em um usuário comum — privilégios elevados precisam ser atribuídos explicitamente.

**`createdAt DateTime @default(now())`** — o banco preenche automaticamente na criação. Não é responsabilidade da aplicação gerenciar esse valor.

**`updatedAt DateTime @updatedAt`** — o Prisma atualiza automaticamente a cada `update`. Não é necessário incluir este campo em nenhuma operação de escrita.

**`contacts Contact[]`** — campo virtual que representa a relação. Não existe como coluna no banco — é apenas um atalho para o Prisma incluir os contatos relacionados quando necessário com `include: { contacts: true }`.

**`@@map("users")`** — a tabela no banco se chama `users` (plural, snake_case), mas o modelo no Prisma se chama `User` (singular, PascalCase). Isso segue as convenções de cada contexto: SQL usa plural snake_case, TypeScript usa singular PascalCase.

---

## Modelo `Contact`

```prisma
model Contact {
  id        String   @id @default(uuid())
  name      String
  email     String?
  phone     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  userId    String

  user User @relation(fields: [userId], references: [id])

  @@map("contacts")
}
```

### Decisões de design

**`email String?`** — o `?` torna o campo nullable. Um contato pode não ter email — só o telefone é obrigatório. Isso reflete a realidade: nem toda pessoa tem (ou fornece) endereço de email.

**`userId String`** — chave estrangeira para `User.id`. Cada contato pertence a exatamente um usuário.

**`user User @relation(...)`** — define a relação no Prisma. `fields: [userId]` diz qual campo desta tabela é a chave estrangeira. `references: [id]` diz qual campo da tabela `User` é a chave referenciada. Esta linha não cria uma coluna extra — apenas ensina o Prisma a fazer o JOIN.

### Por que o modelo é `Contact` (singular) e não `Contacts`?

Convenção: modelos Prisma representam uma **entidade** — uma unidade singular. `User` representa um usuário, `Contact` representa um contato. A tabela no banco é `contacts` (plural), mas o modelo é `Contact` (singular). Isso resulta em queries mais naturais:

```ts
prisma.contact.findMany()  // "encontre vários contatos"
prisma.user.findUnique()   // "encontre um único usuário"
```

---

## Migrations

Migrations são arquivos SQL gerados automaticamente pelo Prisma que registram cada alteração no schema. Eles funcionam como um histórico versionado do banco de dados.

### Criando uma migration em desenvolvimento

```bash
npx prisma migrate dev --name init
```

Isso:
1. Compara o schema atual com o estado do banco
2. Gera o SQL necessário para aplicar as diferenças
3. Aplica o SQL no banco de desenvolvimento
4. Salva o arquivo SQL em `prisma/migrations/<timestamp>_init/migration.sql`

### Aplicando migrations em outros ambientes

```bash
npx prisma migrate deploy
```

Aplica todas as migrations pendentes. Usado em CI/CD e em produção. Não gera migrations novas — apenas aplica as existentes.

### Por que não usar `prisma db push`?

`prisma db push` aplica o schema diretamente no banco sem criar migrations. É útil para prototipagem rápida, mas perigoso em produção: não há histórico, não é reproduzível, e pode destruir dados ao recriar tabelas. Migrations são o caminho correto para ambientes onde os dados importam.

### Estrutura de uma migration

```
prisma/migrations/
  20260325005323_init/
    migration.sql        ← SQL gerado para criar as tabelas iniciais
  20260407212327_add_role/
    migration.sql        ← SQL gerado para adicionar a coluna role
  migration_lock.toml    ← bloqueia o provider — previne migrações acidentais entre bancos
```

O `migration_lock.toml` garante que as migrations foram criadas para um provider específico (sqlite, postgresql, etc.) e previne que sejam aplicadas em um banco diferente por engano.

---

## Inspecionando os dados

```bash
npx prisma studio
```

Abre uma interface web para visualizar e editar os dados do banco diretamente no navegador. Útil para verificar o estado do banco durante o desenvolvimento sem precisar de um cliente SQL separado.
