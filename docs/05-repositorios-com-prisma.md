# Etapa 5 — Repositórios com Prisma

## Objetivo

Implementar as classes concretas de repositório que satisfazem os contratos definidos pelas interfaces, usando o PrismaClient para todas as operações de banco de dados.

---

## `src/repositories/user.repository.ts`

```ts
import bcrypt from "bcryptjs";
import prisma from "../database/prisma-client.js";
import type {
    User,
    UserCreate,
    UserUpdate,
    UserRepository,
    UserWithPassword,
} from "../interfaces/user.interface.js";

const userSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    createdAt: true,
    updatedAt: true,
} as const;

class UserRepositoryPrisma implements UserRepository {
    async create(data: UserCreate): Promise<User> {
        const passwordHash = await bcrypt.hash(data.password, 10);
        return prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                password: passwordHash,
                role: data.role ?? "user",
            },
            select: userSelect,
        });
    }

    async findAll(): Promise<User[]> {
        return prisma.user.findMany({ select: userSelect });
    }

    async findById(id: string): Promise<User | null> {
        return prisma.user.findUnique({ where: { id }, select: userSelect });
    }

    async findByEmail(email: string): Promise<UserWithPassword | null> {
        return prisma.user.findUnique({ where: { email } });
    }

    async update(id: string, data: UserUpdate): Promise<User> {
        const updateData: {
            name?: string;
            email?: string;
            password?: string;
            role?: string;
        } = {};

        if (data.name !== undefined) updateData.name = data.name;
        if (data.email !== undefined) updateData.email = data.email;
        if (data.role !== undefined) updateData.role = data.role;
        if (data.password !== undefined) {
            updateData.password = await bcrypt.hash(data.password, 10);
        }

        return prisma.user.update({ where: { id }, data: updateData, select: userSelect });
    }

    async delete(id: string): Promise<User> {
        return prisma.user.delete({ where: { id }, select: userSelect });
    }
}

export { UserRepositoryPrisma };
```

---

### `implements UserRepository`

A keyword `implements` instrui o TypeScript a verificar que a classe satisfaz o contrato da interface:

```ts
class UserRepositoryPrisma implements UserRepository {
    // Se faltar qualquer método definido em UserRepository,
    // o TypeScript produz um erro de compilação.
}
```

Isso é diferente de simplesmente escrever os métodos sem `implements`. Com `implements`, o TypeScript garante que a classe é um substituto válido para a interface — qualquer código que aceita `UserRepository` pode receber `UserRepositoryPrisma` sem problemas.

---

### `userSelect` com `as const`

```ts
const userSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    createdAt: true,
    updatedAt: true,
} as const;
```

Este objeto é passado para o Prisma no campo `select`, que define quais colunas retornar. Sem ele, o Prisma retorna **todas** as colunas — incluindo `password`.

**`as const`** torna o objeto imutável e **estreita os tipos** das propriedades de `boolean` para `true`. Isso é necessário para que o Prisma infira corretamente o tipo de retorno:

```ts
// Sem as const — retorno inferido como User (todos os campos)
const select = { id: true, name: true }; // tipo: { id: boolean, name: boolean }

// Com as const — retorno preciso, excluindo campos não selecionados
const select = { id: true, name: true } as const; // tipo: { id: true, name: true }
```

Com `as const`, o Prisma sabe exatamente quais campos estão selecionados e o tipo de retorno de `prisma.user.findMany({ select: userSelect })` é `{ id: string, name: string, ... }` — sem `password`. A interface `User` (que também não tem `password`) é estruturalmente compatível, então TypeScript aceita o retorno sem cast.

**Consequência de segurança**: é impossível retornar a senha acidentalmente. Se alguém tentar adicionar `password: true` no `userSelect`, o retorno mudaria para incluir `password`, que não existe em `User`, causando um erro de compilação. A ausência da senha é **garantida pelos tipos**.

---

### `bcrypt.hash(data.password, 10)`

```ts
const passwordHash = await bcrypt.hash(data.password, 10);
```

**O que o bcrypt faz:** aplica uma função hash criptográfica one-way à senha. O resultado é uma string como `$2a$10$...` que não pode ser revertida para a senha original. Para verificar uma senha, usa-se `bcrypt.compare(plain, hash)`.

**O segundo argumento (`10`)** é o cost factor — quantas rodadas de hash são aplicadas. Cada incremento de 1 **dobra** o tempo de computação:

| Cost | Tempo aproximado |
|---|---|
| 8 | ~5ms |
| 10 | ~20ms |
| 12 | ~80ms |
| 14 | ~320ms |

10 é o valor padrão recomendado — lento o suficiente para dificultar ataques de força bruta, rápido o suficiente para não impactar o usuário.

**Risco de não usar bcrypt:** armazenar senhas em texto puro ou com hash simples (MD5, SHA-1) é uma vulnerabilidade crítica. Se o banco vazar, todas as senhas ficam expostas. Com bcrypt, o atacante precisa de tempo computacional significativo para cada senha — reduzindo o impacto de um vazamento.

**Por que o hash fica no repositório e não no use case?**

Centralizar o hashing no repositório garante que a senha seja sempre hashada antes de chegar ao banco, independente de qual camada chama o método. O use case não precisa se preocupar com isso — a camada de acesso ao banco é responsável por garantir que dados sensíveis sejam tratados corretamente.

---

### `role: data.role ?? "user"`

```ts
role: data.role ?? "user",
```

O operador `??` (nullish coalescing) usa o valor da direita apenas quando o da esquerda é `null` ou `undefined`. Como `UserCreate.role` é `role?: string` (opcional), pode ser `undefined` quando omitido. O `??` garante que o default `"user"` é usado nesses casos.

Isso é redundante com o `@default("user")` no schema Prisma? Não — são defesas em camadas diferentes. O default do Prisma aplica-se no nível do banco. O `?? "user"` no código aplica-se antes da query chegar ao banco. Ter ambos garante que o campo nunca seja `undefined` no objeto enviado ao Prisma.

---

### `update` com verificação campo a campo

```ts
async update(id: string, data: UserUpdate): Promise<User> {
    const updateData: {
        name?: string;
        email?: string;
        password?: string;
        role?: string;
    } = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.password !== undefined) {
        updateData.password = await bcrypt.hash(data.password, 10);
    }

    return prisma.user.update({ where: { id }, data: updateData, select: userSelect });
}
```

Este padrão implementa atualização parcial. O problema que ele resolve:

```ts
// Se passarmos data diretamente para o Prisma...
return prisma.user.update({ where: { id }, data, select: userSelect });
```

Com `exactOptionalPropertyTypes: true`, campos ausentes em `UserUpdate` são `undefined`. Mas passar `{ name: undefined }` para o Prisma pode ter comportamento inesperado — dependendo da versão, pode sobrescrever o valor ou ser ignorado, mas não é garantido.

A solução é construir o objeto `updateData` apenas com os campos que realmente têm valor. O Prisma atualiza apenas os campos presentes no objeto `data`. Se `updateData` não tem `name`, o nome não é tocado no banco.

A verificação é `!== undefined` (não `!`), porque `""` (string vazia) é um valor válido que poderia ser usado para limpar um campo — e seria descartado por uma verificação `!`.

O password recebe tratamento especial: se presente, é hashado antes de entrar no `updateData`. O usuario pode trocar a senha enviando o novo valor em texto puro — o repositório garante que o hash é aplicado.

---

## `src/repositories/contact.repository.ts`

```ts
import prisma from "../database/prisma-client.js";
import type {
    Contact,
    ContactCreate,
    ContactUpdate,
    ContactRepository,
} from "../interfaces/contact.interface.js";

class ContactRepositoryPrisma implements ContactRepository {
    async create(data: ContactCreate): Promise<Contact> {
        return prisma.contact.create({ data });
    }

    async findAll(): Promise<Contact[]> {
        return prisma.contact.findMany();
    }

    async findById(id: string): Promise<Contact | null> {
        return prisma.contact.findUnique({ where: { id } });
    }

    async findByUserId(userId: string): Promise<Contact[]> {
        return prisma.contact.findMany({ where: { userId } });
    }

    async update(id: string, data: ContactUpdate): Promise<Contact> {
        return prisma.contact.update({ where: { id }, data });
    }

    async delete(id: string): Promise<Contact> {
        return prisma.contact.delete({ where: { id } });
    }
}

export { ContactRepositoryPrisma };
```

### Por que `ContactRepository` é mais simples que `UserRepository`?

Contatos não têm campos sensíveis — não há `userSelect` para excluir a senha, não há hashing. O `ContactCreate` pode ser passado diretamente para `prisma.contact.create({ data })` sem transformação.

O Prisma lida com campos opcionais (`email?: string | null`) corretamente: campos ausentes são ignorados, `null` é gravado como NULL no banco.

### `update` sem verificação campo a campo

```ts
async update(id: string, data: ContactUpdate): Promise<Contact> {
    return prisma.contact.update({ where: { id }, data });
}
```

Ao contrário do `UserRepository`, o `ContactRepository` passa `data` diretamente. Isso funciona porque:

1. `ContactUpdate` tem apenas campos opcionais (`string`, `string | null`, não campos sensíveis)
2. O Prisma ignora automaticamente campos `undefined` no objeto `data` do `update`

Esta simplificação é válida quando não há transformações necessárias. Seguindo o princípio de não adicionar complexidade desnecessária — o código deve ser tão simples quanto o problema exige.

---

## Comparação: Prisma vs SQL manual

| Operação | SQL manual | Prisma |
|---|---|---|
| Criar | `INSERT INTO contacts (id, name, phone, email, userId) VALUES (?, ?, ?, ?, ?)` | `prisma.contact.create({ data })` |
| Buscar por ID | `SELECT * FROM contacts WHERE id = ?` | `prisma.contact.findUnique({ where: { id } })` |
| Filtrar por usuário | `SELECT * FROM contacts WHERE userId = ?` | `prisma.contact.findMany({ where: { userId } })` |
| Atualizar | `UPDATE contacts SET name = ?, phone = ? WHERE id = ?` | `prisma.contact.update({ where: { id }, data })` |
| Deletar | `DELETE FROM contacts WHERE id = ?` | `prisma.contact.delete({ where: { id } })` |

A vantagem não é só brevidade — é que o Prisma **verifica os tipos** em tempo de compilação. Uma query SQL com nome de coluna errado só falha em runtime. Com Prisma, `prisma.contact.findMany({ where: { userID: userId } })` (com ID maiúsculo) é um erro de compilação — `userID` não existe no modelo.
