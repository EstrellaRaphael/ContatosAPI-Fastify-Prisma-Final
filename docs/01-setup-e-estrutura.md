# Etapa 1 — Setup Inicial e Estrutura do Projeto

## Objetivo

Criar a base do projeto com TypeScript, configurar o ambiente de desenvolvimento e definir a organização de pastas que reflete a arquitetura em camadas adotada ao longo de todo o desenvolvimento.

---

## Por que TypeScript?

TypeScript adiciona tipagem estática ao JavaScript, tornando erros detectáveis em tempo de compilação — antes do código chegar a produção. A diferença prática:

```ts
// JavaScript — sem tipagem, qualquer valor pode ser passado
function criarUsuario(data) { ... }
criarUsuario({ nome: "João" }); // campo errado: "nome" ao invés de "name" — erro silencioso

// TypeScript — o compilador rejeita dados incorretos
function criarUsuario(data: UserCreate): Promise<User> { ... }
criarUsuario({ nome: "João" }); // Erro: Object literal may only specify known properties
```

TypeScript não executa diretamente no Node.js — precisa de uma ferramenta como o `tsx` para desenvolvimento ou `tsc` para compilar para produção.

---

## Dependências

```bash
# Ferramentas de desenvolvimento
npm install --save-dev typescript tsx @types/node @types/bcryptjs @types/better-sqlite3 prisma

# Runtime
npm install fastify @prisma/client @prisma/adapter-better-sqlite3 better-sqlite3 bcryptjs dotenv
```

| Pacote | Tipo | Função |
|---|---|---|
| `typescript` | dev | Compilador TypeScript |
| `tsx` | dev | Executa `.ts` diretamente no Node com hot reload |
| `@types/node` | dev | Tipos dos globals do Node.js (`process.env`, etc.) |
| `@types/bcryptjs` | dev | Tipos da biblioteca bcryptjs |
| `@types/better-sqlite3` | dev | Tipos do driver SQLite |
| `prisma` | dev | CLI do Prisma (migrations, generate, studio) |
| `fastify` | prod | Framework web — servidor HTTP |
| `@prisma/client` | prod | Client base do Prisma (necessário para o adapter) |
| `@prisma/adapter-better-sqlite3` | prod | Adapter que conecta Prisma ao driver SQLite |
| `better-sqlite3` | prod | Driver SQLite síncrono de alta performance |
| `bcryptjs` | prod | Hash e verificação de senhas |
| `dotenv` | prod | Lê variáveis de ambiente do arquivo `.env` |

### Por que `bcryptjs` e não `bcrypt`?

`bcrypt` é um módulo nativo (C++) que requer compilação. `bcryptjs` é uma implementação pura em JavaScript — sem dependências nativas, sem problemas de compilação em diferentes plataformas. Em termos de segurança, são equivalentes.

---

## `package.json`

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx --watch src/server.ts",
    "build": "tsc"
  }
}
```

**`"type": "module"`** — habilita ES Modules nativos. Todo arquivo `.js` gerado usa `import/export` em vez de `require/module.exports`. Isso alinha o projeto com o padrão moderno do ecossistema Node.js.

**`tsx --watch`** — observa alterações nos arquivos e reinicia o servidor automaticamente. O flag `--watch` (com dois traços) é a forma correta para tsx 4.x.

**`build: "tsc"`** — compila o projeto para `dist/` para uso em produção. Em produção, o código é executado como JavaScript puro, sem o overhead do tsx.

---

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "module": "nodenext",
    "target": "es2023",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,
    "skipLibCheck": true
  },
  "exclude": ["prisma.config.ts", "node_modules"]
}
```

| Opção | Significado |
|---|---|
| `rootDir: "./src"` | Arquivos fonte em `src/`. TypeScript não compila nada fora disso |
| `outDir: "./dist"` | Arquivos `.js` gerados vão para `dist/` |
| `module: "nodenext"` | Resolução de módulos compatível com Node.js ESM. **Exige extensão `.js` nos imports** |
| `target: "es2023"` | JavaScript gerado usa sintaxe ES2023 — compatível com Node.js 20+ |
| `strict: true` | Ativa todas as verificações rígidas de tipagem |
| `noUncheckedIndexedAccess: true` | Acesso por índice (`obj[key]`) retorna `T \| undefined` — previne acesso a propriedades inexistentes |
| `exactOptionalPropertyTypes: true` | Propriedades opcionais (`name?: string`) não aceitam `undefined` explícito — apenas ausência |
| `verbatimModuleSyntax: true` | Imports de tipo devem usar `import type` — o compilador os remove sem rastros no output |
| `isolatedModules: true` | Cada arquivo deve ser um módulo independente — necessário para ferramentas de transpilação rápida |
| `moduleDetection: "force"` | Todos os arquivos são tratados como módulos, mesmo sem `import`/`export` |
| `sourceMap: true` | Gera `.map` files — permite debugar TypeScript mesmo executando JavaScript |
| `declaration: true` | Gera arquivos `.d.ts` — permite que outros projetos TypeScript usem este como biblioteca |
| `skipLibCheck: true` | Ignora erros de tipagem dentro de `node_modules` — algumas libs têm tipos imperfeitos |

### Por que `.js` nos imports TypeScript?

Com `module: "nodenext"`, o TypeScript segue a resolução ESM do Node.js. O Node resolve arquivos pela extensão literal do caminho — se o arquivo compilado será `.js`, o import deve referenciar `.js`:

```ts
// Correto — referencia o arquivo compilado
import { UserRepositoryPrisma } from "./repositories/user.repository.js";

// Errado — Node não encontra arquivo sem extensão em modo ESM
import { UserRepositoryPrisma } from "./repositories/user.repository";
```

Isso pode parecer estranho (o arquivo source é `.ts`, mas o import diz `.js`), mas é a convenção do ESM no Node. O tsx e o tsc entendem essa convenção.

### O que `exclude: ["prisma.config.ts"]` faz?

O `prisma.config.ts` é usado exclusivamente pelo CLI do Prisma — não faz parte do código da aplicação. Excluí-lo do tsconfig evita que o TypeScript tente compilá-lo junto com o restante do projeto, o que causaria erros porque ele usa `import "dotenv/config"` como side-effect (padrão que `isolatedModules` restringe no código normal).

---

## `.gitignore`

```
node_modules
.env
src/generated
dev.db
dist
```

| Entrada | Motivo |
|---|---|
| `node_modules` | Regenerado com `npm install` — não deve ser versionado |
| `.env` | Contém segredos (URLs de banco, chaves) — nunca deve ir para o repositório |
| `src/generated` | Gerado automaticamente pelo Prisma com `npx prisma generate` |
| `dev.db` | Arquivo do banco SQLite — contém dados locais de desenvolvimento |
| `dist` | Código compilado — gerado pelo `npm run build` |

---

## Estrutura de pastas

```
api-contatos-fastify-prisma/
  prisma/
    schema.prisma           ← definição dos modelos e do banco
    migrations/             ← histórico de alterações no banco
  src/
    database/
      prisma-client.ts      ← instância única do PrismaClient
    errors/
      app-error.ts          ← classe de erros controlados da aplicação
    generated/
      prisma/               ← client gerado automaticamente pelo Prisma
    interfaces/
      user.interface.ts     ← contratos TypeScript para usuários
      contact.interface.ts  ← contratos TypeScript para contatos
    middlewares/
      auth.middleware.ts    ← autenticação — executado antes das rotas protegidas
    repositories/
      user.repository.ts    ← acesso ao banco para usuários
      contact.repository.ts ← acesso ao banco para contatos
    routes/
      user.routes.ts        ← endpoints HTTP para usuários
      contact.routes.ts     ← endpoints HTTP para contatos
    types/
      fastify.d.ts          ← extensão de tipos do Fastify
    usecases/
      user.usecase.ts       ← regras de negócio de usuários
      contact.usecase.ts    ← regras de negócio de contatos
    server.ts               ← ponto de entrada da aplicação
  prisma.config.ts          ← configuração do Prisma CLI
```

### Por que essa organização?

A estrutura reflete a arquitetura em camadas do projeto. Cada pasta representa uma responsabilidade distinta:

| Camada | Pasta | Responsabilidade |
|---|---|---|
| HTTP | `routes/` | Receber requisição, extrair dados, devolver resposta |
| Negócio | `usecases/` | Aplicar regras do domínio, orquestrar operações |
| Segurança | `middlewares/` | Validar identidade antes de processar a requisição |
| Dados | `repositories/` | Traduzir operações de negócio em queries de banco |
| Contratos | `interfaces/` | Definir a forma dos dados e os contratos entre camadas |
| Banco | `database/` | Configurar e expor o cliente de banco de dados |
| Erros | `errors/` | Centralizar os tipos de erro da aplicação |
| Tipos | `types/` | Extensões de tipos de bibliotecas externas |

Organizar por **responsabilidade** (não por tipo de arquivo) facilita navegar pelo código: quando há um bug na lógica de criação de contato, vai-se direto para `usecases/contact.usecase.ts`. Quando a query está errada, `repositories/contact.repository.ts`. Essa previsibilidade reduz o tempo de orientação no código.

---

## Porta 3100

A aplicação escuta na porta `3100`. Isso evita conflito com outras APIs rodando localmente na porta padrão `3000`.
