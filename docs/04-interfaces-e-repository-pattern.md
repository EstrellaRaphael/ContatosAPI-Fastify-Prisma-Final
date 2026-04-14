# Etapa 4 — Interfaces TypeScript e Repository Pattern

## Objetivo

Definir os contratos de dados da aplicação usando interfaces TypeScript e estabelecer o Repository Pattern como a abstração que separa a lógica de negócio do acesso ao banco de dados.

---

## O que são interfaces TypeScript?

Interfaces são contratos. Elas definem a **forma** que um objeto deve ter, sem dizer como ele é criado ou de onde vem. O TypeScript usa interfaces apenas em tempo de compilação — elas não geram código JavaScript.

```ts
interface User {
    id: string;
    name: string;
    email: string;
}

// TypeScript verifica se o objeto satisfaz o contrato
const user: User = {
    id: "abc-123",
    name: "João",
    email: "joao@email.com",
    // senha: "123" → Erro: 'senha' não existe em User
};
```

Interfaces permitem escrever código que funciona com **qualquer coisa que satisfaça o contrato**, sem se preocupar com a implementação concreta.

---

## `src/interfaces/user.interface.ts`

```ts
interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
}

interface UserWithPassword extends User {
    password: string;
}

interface UserCreate {
    name: string;
    email: string;
    password: string;
    role?: string;
}

interface UserUpdate {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
}

interface UserRepository {
    create(data: UserCreate): Promise<User>;
    findAll(): Promise<User[]>;
    findById(id: string): Promise<User | null>;
    findByEmail(email: string): Promise<UserWithPassword | null>;
    update(id: string, data: UserUpdate): Promise<User>;
    delete(id: string): Promise<User>;
}

export type { User, UserWithPassword, UserCreate, UserUpdate, UserRepository };
```

### Por que `User` não inclui `password`?

A interface `User` representa um usuário **como ele é enviado para o cliente**. Senhas — mesmo hashed — nunca devem vazar nas respostas da API. Separar `User` de `UserWithPassword` cria uma barreira no sistema de tipos:

```ts
// findAll retorna User[] — o TypeScript impede acessar .password
const users = await userRepository.findAll();
users[0].password; // Erro de compilação — propriedade não existe em User

// findByEmail retorna UserWithPassword | null — necessário para autenticação
const user = await userRepository.findByEmail(email);
user.password; // OK — explicitamente necessário aqui
```

Isso não é apenas boa prática — é **segurança imposta pelo compilador**. Se um desenvolvedor tentar retornar a senha em uma rota, o TypeScript produz um erro antes do código rodar.

### `UserWithPassword extends User`

A herança de interface evita duplicação. `UserWithPassword` tem todos os campos de `User` mais o campo `password`. Se `User` mudar, `UserWithPassword` acompanha automaticamente.

### `UserCreate` vs `UserUpdate`

São interfaces distintas porque as operações têm requisitos diferentes:

**`UserCreate`** — para criação, campos obrigatórios são obrigatórios:
- `name`, `email`, `password` são required — não faz sentido criar um usuário sem eles
- `role` é opcional — tem um default (`"user"`)

**`UserUpdate`** — para atualização, tudo é opcional:
- O cliente pode querer atualizar apenas o nome, sem tocar email ou senha
- Campos ausentes são ignorados — não sobrescrevem os valores existentes

```ts
// Atualização parcial — só atualiza o nome
await userRepository.update(id, { name: "Novo Nome" });
// email, password, role permanecem os mesmos no banco
```

### `role?: string` com `exactOptionalPropertyTypes`

Com `exactOptionalPropertyTypes: true` no tsconfig, `role?: string` significa que a propriedade pode:
- **Estar ausente** do objeto (`{}`)
- **Ser uma string** (`{ role: "admin" }`)

Mas **não pode ser `undefined` explicitamente**:
```ts
const data: UserCreate = {
    name: "João",
    email: "joao@email.com",
    password: "123",
    role: undefined, // Erro com exactOptionalPropertyTypes!
};
```

Isso previne um bug sutil: passar `undefined` explicitamente para um campo que tem `@default` no Prisma pode sobrescrever o default — comportamento contraintuitivo.

---

## `src/interfaces/contact.interface.ts`

```ts
interface Contact {
    id: string;
    name: string;
    email: string | null;
    phone: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
}

interface ContactCreate {
    name: string;
    phone: string;
    email?: string | null;
    userId: string;
}

interface ContactUpdate {
    name?: string;
    phone?: string;
    email?: string | null;
}

interface ContactRepository {
    create(data: ContactCreate): Promise<Contact>;
    findAll(): Promise<Contact[]>;
    findById(id: string): Promise<Contact | null>;
    findByUserId(userId: string): Promise<Contact[]>;
    update(id: string, data: ContactUpdate): Promise<Contact>;
    delete(id: string): Promise<Contact>;
}
```

### `email: string | null` vs `email?: string | null`

Há uma diferença importante entre os dois:

**`email: string | null`** (no `Contact`) — o campo **existe** no banco, mas pode ter o valor `null`. Quando você lê um contato, o campo sempre está presente na resposta, só que pode ser `null`.

**`email?: string | null`** (no `ContactCreate` e `ContactUpdate`) — o campo é **opcional na entrada**. Pode ser omitido totalmente, pode ser `null`, ou pode ser uma string. Isso permite:

```ts
// Criar sem email — campo omitido
await contactRepository.create({ name: "Maria", phone: "999", userId: "abc" });

// Criar com email
await contactRepository.create({ name: "Maria", phone: "999", email: "maria@email.com", userId: "abc" });

// Remover email existente — setar para null
await contactRepository.update(id, { email: null });
```

O terceiro caso é importante: `email: null` em um update significa "remova o email deste contato". Se o campo fosse apenas `email?: string`, não haveria como expressar "quero apagar este valor".

### `findByUserId`

O repositório de contatos tem um método extra: `findByUserId`. Ele existe porque o caso de uso mais comum não é "liste todos os contatos do sistema", mas "liste todos os contatos **deste usuário**". Ter esse método na interface garante que qualquer implementação do repositório o suporte.

---

## Repository Pattern

O Repository Pattern é um padrão de design que abstrai o acesso ao banco de dados atrás de uma interface. Em vez de espalhar queries Prisma pelo código, elas ficam centralizadas nos repositórios.

### O problema sem o padrão

```ts
// Sem repositório — use case acessando o banco diretamente
class ContactUseCase {
    async create(userId: string, data: ContactCreate): Promise<Contact> {
        // Lógica de negócio misturada com acesso ao banco
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error("User not found");

        return prisma.contact.create({ data: { ...data, userId } });
    }
}
```

Problemas:
- O use case conhece o Prisma — acoplamento direto
- Para testar, é necessário um banco real
- Se trocar de banco, precisar mudar o use case

### A solução com o padrão

```ts
// Com repositório — use case depende apenas da interface
class ContactUseCase {
    constructor(private readonly contactRepository: ContactRepository) {}

    async create(userId: string, data: Omit<ContactCreate, "userId">): Promise<Contact> {
        return this.contactRepository.create({ ...data, userId });
    }
}
```

O use case não sabe se o repositório usa Prisma, um array em memória, ou uma API HTTP. Ele só sabe que o repositório implementa `ContactRepository`.

### Dependency Inversion Principle (SOLID — D)

Este padrão implementa o **D** do SOLID: **Dependency Inversion**. A regra é:

> Módulos de alto nível não devem depender de módulos de baixo nível. Ambos devem depender de abstrações.

| Módulo | Nível | Depende de |
|---|---|---|
| `ContactUseCase` | Alto (negócio) | `ContactRepository` (interface) |
| `ContactRepositoryPrisma` | Baixo (dados) | `ContactRepository` (interface) |

Os dois dependem da interface, não um do outro. Isso significa que `ContactRepositoryPrisma` pode ser substituído por `ContactRepositoryMemory` (para testes) ou `ContactRepositoryPostgres` (para produção em outro banco) sem modificar o `ContactUseCase`.

### `export type { ... }`

```ts
export type { User, UserWithPassword, UserCreate, UserUpdate, UserRepository };
```

Com `verbatimModuleSyntax: true` no tsconfig, o TypeScript exige que imports de apenas tipos usem `import type`. A contrapartida é que exports de apenas tipos usem `export type`. Isso garante que, ao compilar para JavaScript, esses exports sejam completamente removidos — interfaces não existem em runtime. Usar `export type` comunica essa intenção explicitamente e evita que o bundler precise analisar se o export tem valor em runtime.
