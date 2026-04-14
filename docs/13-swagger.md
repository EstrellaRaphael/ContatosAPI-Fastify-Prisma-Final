# Etapa 13 — Documentação Automática com Swagger

## Objetivo

Gerar documentação interativa da API automaticamente a partir do código, usando `@fastify/swagger` para produzir a especificação OpenAPI e `@fastify/swagger-ui` para servir a interface visual — com suporte a autenticação para testar rotas protegidas diretamente no navegador.

---

## O que é OpenAPI e Swagger?

**OpenAPI** (anteriormente Swagger) é uma especificação padrão para descrever APIs REST. Um documento OpenAPI é um arquivo JSON ou YAML que descreve cada endpoint: URL, método HTTP, parâmetros, corpo esperado, respostas possíveis e mecanismos de autenticação.

**Swagger UI** é uma interface web que lê um documento OpenAPI e gera documentação interativa — com formulários para preencher dados e enviar requisições reais diretamente no navegador.

A vantagem de gerar a especificação **a partir do código** (em vez de escrever manualmente) é que a documentação fica sempre sincronizada com a implementação — não há um documento separado para manter atualizado.

---

## Dependências instaladas

```bash
npm install @fastify/swagger @fastify/swagger-ui
```

| Pacote | Função |
|---|---|
| `@fastify/swagger` | Lê os schemas das rotas registradas e gera o documento OpenAPI |
| `@fastify/swagger-ui` | Serve a interface visual em `/docs` consumindo o documento gerado |

---

## Configuração em `src/server.ts`

```ts
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

app.register(swagger, {
    openapi: {
        openapi: "3.0.3",
        info: {
            title: "API de Agenda de Contatos",
            description: "...",
            version: "1.0.0",
        },
        components: {
            securitySchemes: {
                EmailAuth: {
                    type: "apiKey",
                    in: "header",
                    name: "email",
                    description: "Email do usuário cadastrado",
                },
                PasswordAuth: {
                    type: "apiKey",
                    in: "header",
                    name: "password",
                    description: "Senha do usuário em texto puro",
                },
            },
        },
        tags: [
            { name: "Usuários", description: "Gerenciamento de usuários" },
            { name: "Contatos", description: "Gerenciamento de contatos (requer autenticação)" },
        ],
    },
});

app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
        docExpansion: "list",
        deepLinking: true,
    },
});
```

### Por que registrar **antes** das rotas?

```ts
app.register(swagger, { ... });     // ← primeiro
app.register(swaggerUi, { ... });   // ← segundo
app.register(userRoutes, { ... });  // ← depois
app.register(contactRoutes, { ... });
```

O `@fastify/swagger` funciona como um **listener** do ciclo de vida do Fastify: ele se conecta ao evento de adição de rotas e coleta os schemas de cada uma. Para coletar corretamente, precisa estar registrado antes das rotas. Se registrado depois, as rotas já foram adicionadas sem a coleta dos schemas.

### `openapi: "3.0.3"` — versão da especificação

Especifica que o documento gerado segue a versão 3.0.3 do padrão OpenAPI. A versão importa porque ferramentas que consomem o documento (geradores de SDK, validadores) usam esta informação para interpretar corretamente os campos.

A versão 3.1.0 (mais recente) usa JSON Schema nativo — mas tem menor suporte em algumas ferramentas. A 3.0.3 é a versão mais amplamente suportada no ecossistema atual.

### `securitySchemes` — autenticação no Swagger UI

```ts
components: {
    securitySchemes: {
        EmailAuth: {
            type: "apiKey",
            in: "header",
            name: "email",
        },
        PasswordAuth: {
            type: "apiKey",
            in: "header",
            name: "password",
        },
    },
},
```

Define dois esquemas de segurança baseados em API Key via header. `type: "apiKey"` é o tipo OpenAPI para autenticação via header, query string ou cookie com uma chave arbitrária.

Quando o usuário clica em **Authorize** no Swagger UI, um modal exibe campos para `EmailAuth` e `PasswordAuth`. Ao preencher e confirmar, o Swagger UI inclui esses valores nos headers de todas as requisições subsequentes — sem precisar digitar em cada chamada individualmente.

### `tags` — agrupamento de endpoints

```ts
tags: [
    { name: "Usuários", description: "..." },
    { name: "Contatos", description: "..." },
]
```

As tags organizam os endpoints em grupos no Swagger UI. Cada rota referencia uma tag via `schema.tags: ["Usuários"]`. O Swagger UI agrupa visualmente as rotas por tag, tornando a navegação mais clara.

### `uiConfig.docExpansion: "list"`

Controla o estado inicial dos endpoints no Swagger UI:
- `"list"` — mostra as rotas colapsadas (apenas título)
- `"full"` — abre todos os detalhes por padrão
- `"none"` — colapsa tudo, inclusive as tags

`"list"` é o padrão mais usável: dá uma visão geral de todas as rotas sem sobrecarregar a tela.

---

## Schemas de rotas

Os schemas adicionados às rotas servem a dois propósitos simultâneos:

1. **Documentação** — o `@fastify/swagger` lê esses schemas e os inclui no documento OpenAPI
2. **Validação em runtime** — o Fastify usa os schemas `body` e `params` com AJV para validar as requisições antes de chegar ao handler

Isso significa que adicionar Swagger ao projeto é um ganho duplo: documentação gratuita + validação automática de entrada.

### Exemplo de rota documentada

```ts
fastify.post<{ Body: UserCreate }>("/", {
    schema: {
        tags: ["Usuários"],
        summary: "Criar usuário",
        description: "Rota pública. Cria um novo usuário e retorna os dados sem a senha.",
        body: UserCreateBodySchema,
        response: {
            201: UserResponseSchema,
            409: ErrorResponseSchema,
        },
    },
}, async (request, reply) => { ... });
```

| Campo do schema | Efeito no OpenAPI | Efeito em runtime |
|---|---|---|
| `tags` | Agrupa a rota no UI | Nenhum |
| `summary` | Título curto da rota | Nenhum |
| `description` | Descrição longa | Nenhum |
| `body` | Documenta o body esperado | Valida o body recebido |
| `params` | Documenta os parâmetros de URL | Valida os params recebidos |
| `response` | Documenta as respostas | Serializa respostas mais rápido |
| `security` | Mostra cadeado na rota | Nenhum |

### Validação automática pelo AJV

Com o schema `body` definido, o Fastify valida automaticamente cada requisição. Se o body não satisfizer o schema, o Fastify retorna 400 **antes de o handler executar**:

```bash
# Body sem o campo obrigatório "phone"
curl -X POST http://localhost:3100/contacts \
  -H "email: admin@email.com" -H "password: 123456" \
  -H "Content-Type: application/json" \
  -d '{"name": "Contato"}'

# → HTTP 400
# {
#   "statusCode": 400,
#   "error": "Bad Request",
#   "message": "body must have required property 'phone'"
# }
```

O handler de contatos nunca é chamado. A validação acontece na camada de framework, antes da lógica de negócio.

### `additionalProperties: false`

```ts
const UserCreateBodySchema = {
    type: "object",
    required: ["name", "email", "password"],
    additionalProperties: false,
    properties: { ... },
} as const;
```

Com `additionalProperties: false`, o AJV **remove** campos extras do body antes de passar para o handler. Se um cliente enviar `{ "name": "...", "email": "...", "password": "...", "admin": true }`, o campo `"admin"` é silenciosamente descartado. Isso previne que campos inesperados cheguem ao repositório e sejam persistidos ou causem comportamentos não intencionais.

---

## Schemas compartilhados

Para evitar duplicação, `IdParamSchema` e `ErrorResponseSchema` — usados em múltiplas rotas — ficam em um arquivo separado:

```ts
// src/schemas/shared.schema.ts
const IdParamSchema = { ... };
const ErrorResponseSchema = { ... };
export { IdParamSchema, ErrorResponseSchema };
```

Ambos os arquivos de rotas importam deste arquivo central. Se o formato do param ID ou da resposta de erro precisar mudar, a alteração é feita em um único lugar.

### Campo `email` nullable no schema de contato

```ts
email: {
    anyOf: [{ type: "string", format: "email" }, { type: "null" }],
    description: "Email do contato (opcional, pode ser null)",
},
```

O campo `email` no model `Contact` é `String?` (nullable no Prisma). Em JSON Schema, um campo que pode ser string ou null usa `anyOf` com dois tipos. Isso documenta corretamente que `null` é um valor válido (para remover um email existente) e `"string"` com `format: "email"` valida o formato do email quando presente.

---

## Acessando a documentação

Com o servidor rodando (`npm run dev`), abra no navegador:

```
http://localhost:3100/docs
```

### O que você verá

- **Cabeçalho** com título, descrição e versão da API
- **Botão Authorize** para preencher `EmailAuth` e `PasswordAuth` globalmente
- **Seção "Usuários"** com as 5 rotas expandíveis
- **Seção "Contatos"** com as 4 rotas expandíveis

### Testando uma rota pelo Swagger UI

1. Clique em **Authorize** → preencha email e password → clique **Authorize** → **Close**
2. Expanda a rota `POST /contacts`
3. Clique em **Try it out**
4. Preencha o body:
   ```json
   {
     "name": "Contato via Swagger",
     "phone": "11999990000"
   }
   ```
5. Clique **Execute**
6. O resultado aparece na seção **Responses**

### Endpoints gerados pelo plugin

O `@fastify/swagger` expõe dois endpoints automáticos:

| URL | Conteúdo |
|---|---|
| `GET /docs/json` | Documento OpenAPI em formato JSON |
| `GET /docs/yaml` | Documento OpenAPI em formato YAML |

Esses endpoints podem ser usados para gerar SDKs de cliente, importar no Postman/Insomnia, ou integrar com outras ferramentas de API.

---

## Diagrama: fluxo do Swagger

```
Inicialização do servidor
    │
    ├── app.register(swagger)
    │       └── instala listener de onRoute
    │
    ├── app.register(swaggerUi)
    │       └── registra GET /docs e GET /docs/json
    │
    ├── app.register(userRoutes)
    │       └── cada fastify.get/post/put/delete dispara onRoute
    │               └── swagger coleta: método, URL, schema
    │
    └── app.register(contactRoutes)
            └── idem

await app.listen(...)
    └── swagger compila o documento OpenAPI final
          └── Swagger UI serve o documento em /docs
```

```
Requisição POST /contacts
    │
    ├── AJV valida body contra ContactCreateBodySchema
    │       ├── válido → handler executa
    │       └── inválido → HTTP 400, handler não executa
    │
    └── Fastify serializa resposta usando ContactResponseSchema
            └── mais rápido que JSON.stringify genérico
```
