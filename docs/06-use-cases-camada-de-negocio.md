# Etapa 6 — Use Cases: Camada de Negócio

## Objetivo

Implementar a camada de regras de negócio usando o padrão Use Case — separando a lógica da aplicação do acesso ao banco (repositórios) e da interface HTTP (rotas).

---

## O que é um Use Case?

Um use case (caso de uso) representa **uma ação que o sistema pode executar**. Ele orquestra a lógica necessária para atender uma requisição: verificar pré-condições, coordenar chamadas a repositórios, aplicar regras do domínio e retornar o resultado.

A pergunta que define o que vai em um use case: *"O que a aplicação faz com esses dados?"*

- Verificar se um email já está em uso → use case
- Impedir que um usuário acesse contatos de outro → use case
- Executar `INSERT INTO users ...` → repositório

---

## `src/usecases/user.usecase.ts`

```ts
import { AppError } from "../errors/app-error.js";
import type {
    User,
    UserCreate,
    UserUpdate,
    UserRepository,
} from "../interfaces/user.interface.js";

class UserUseCase {
    constructor(private readonly userRepository: UserRepository) {}

    async create(data: UserCreate): Promise<User> {
        const exists = await this.userRepository.findByEmail(data.email);
        if (exists) {
            throw new AppError("Email já está em uso", 409);
        }
        return this.userRepository.create(data);
    }

    async findAll(): Promise<User[]> {
        return this.userRepository.findAll();
    }

    async findById(id: string): Promise<User> {
        const user = await this.userRepository.findById(id);
        if (!user) {
            throw new AppError("Usuário não encontrado", 404);
        }
        return user;
    }

    async update(id: string, data: UserUpdate): Promise<User> {
        const exists = await this.userRepository.findById(id);
        if (!exists) {
            throw new AppError("Usuário não encontrado", 404);
        }
        return this.userRepository.update(id, data);
    }

    async delete(id: string): Promise<User> {
        const exists = await this.userRepository.findById(id);
        if (!exists) {
            throw new AppError("Usuário não encontrado", 404);
        }
        return this.userRepository.delete(id);
    }
}

export { UserUseCase };
```

---

### Injeção de dependência via construtor

```ts
class UserUseCase {
    constructor(private readonly userRepository: UserRepository) {}
}
```

O use case recebe o repositório como argumento do construtor — não o instancia diretamente. Isso implementa o **Dependency Inversion Principle**: o use case depende da **abstração** (`UserRepository`), não da **implementação** (`UserRepositoryPrisma`).

**`private readonly`** — `private` impede que código externo acesse o repositório diretamente (encapsulamento). `readonly` impede reatribuição após a criação da instância — o repositório é imutável durante o ciclo de vida do use case.

**Por que não instanciar diretamente?**

```ts
// Acoplamento direto — ruim
class UserUseCase {
    private userRepository = new UserRepositoryPrisma(); // depende do Prisma
}
```

Com essa abordagem, `UserUseCase` fica indissoluvelmente ligado ao Prisma. Para testar com um banco em memória, ou para usar em outro contexto, seria necessário modificar a classe.

Com injeção via construtor:
```ts
// Em produção
const useCase = new UserUseCase(new UserRepositoryPrisma());

// Em testes
const useCase = new UserUseCase(new UserRepositoryInMemory());
```

A mesma lógica de negócio funciona com qualquer implementação que satisfaça `UserRepository`.

---

### `create` — verificação de duplicidade

```ts
async create(data: UserCreate): Promise<User> {
    const exists = await this.userRepository.findByEmail(data.email);
    if (exists) {
        throw new AppError("Email já está em uso", 409);
    }
    return this.userRepository.create(data);
}
```

**Por que verificar no use case se o banco tem `@unique`?**

O `@unique` no schema Prisma garante a integridade no banco — se dois inserts simultâneos passarem pela verificação do use case, o banco rejeita o segundo. Mas a resposta do banco seria uma exceção técnica (constraint violation), não uma mensagem de erro amigável.

Verificar no use case permite:
1. Retornar uma mensagem clara ao cliente (`"Email já está em uso"`)
2. Usar o HTTP status correto (`409 Conflict`, não `500 Internal Server Error`)

As duas defesas se complementam: o use case previne o erro comum, o banco previne condições de corrida.

**HTTP 409 Conflict** — o status semântico correto para "recurso já existe". O cliente saberá exatamente o que fazer (informar outro email), sem precisar interpretar o erro.

---

### `findById` — mudança no tipo de retorno

```ts
// Repositório: findById retorna User | null
async findById(id: string): Promise<User | null>;

// Use case: findById retorna User (ou lança erro)
async findById(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) {
        throw new AppError("Usuário não encontrado", 404);
    }
    return user;
}
```

O repositório retorna `User | null` porque ele não sabe o contexto — não existe no banco é um resultado válido para uma query. O use case transforma `null` em uma exceção com semântica clara: "buscar um usuário que não existe é um erro de negócio".

Isso simplifica o código das rotas — elas não precisam checar se o retorno é `null`:

```ts
// Sem o use case tratando null
const user = await userRepository.findById(id);
if (!user) return reply.status(404).send({ error: "Not found" });
return reply.send(user);

// Com o use case tratando null — a rota só lida com o caminho feliz
const user = await userUseCase.findById(id); // lança AppError se não encontrar
return reply.send(user);
```

---

## `src/usecases/contact.usecase.ts`

```ts
import { AppError } from "../errors/app-error.js";
import type {
    Contact,
    ContactCreate,
    ContactUpdate,
    ContactRepository,
} from "../interfaces/contact.interface.js";

class ContactUseCase {
    constructor(private readonly contactRepository: ContactRepository) {}

    async create(userId: string, data: Omit<ContactCreate, "userId">): Promise<Contact> {
        return this.contactRepository.create({ ...data, userId });
    }

    async findByUserId(userId: string): Promise<Contact[]> {
        return this.contactRepository.findByUserId(userId);
    }

    async update(id: string, userId: string, data: ContactUpdate): Promise<Contact> {
        const contact = await this.contactRepository.findById(id);
        if (!contact) {
            throw new AppError("Contato não encontrado", 404);
        }
        if (contact.userId !== userId) {
            throw new AppError("Acesso negado", 403);
        }
        return this.contactRepository.update(id, data);
    }

    async delete(id: string, userId: string): Promise<Contact> {
        const contact = await this.contactRepository.findById(id);
        if (!contact) {
            throw new AppError("Contato não encontrado", 404);
        }
        if (contact.userId !== userId) {
            throw new AppError("Acesso negado", 403);
        }
        return this.contactRepository.delete(id);
    }
}

export { ContactUseCase };
```

---

### `Omit<ContactCreate, "userId">`

```ts
async create(userId: string, data: Omit<ContactCreate, "userId">): Promise<Contact>
```

`Omit<T, K>` é um utilitário do TypeScript que cria um tipo com todas as propriedades de `T`, exceto `K`. O resultado de `Omit<ContactCreate, "userId">` é:

```ts
{
    name: string;
    phone: string;
    email?: string | null;
    // userId foi removido
}
```

**Por que isso?** O `userId` vem do usuário autenticado — extraído pelo middleware de auth, não do corpo da requisição. Remover `userId` do tipo esperado pelo `create` torna explícito que:
1. A rota não deve aceitar `userId` no body (o cliente não escolhe seu próprio ID)
2. O `userId` é sempre injetado pelo use case a partir do contexto de autenticação

Dentro do método, o `userId` é adicionado antes de persistir:
```ts
return this.contactRepository.create({ ...data, userId });
```

O spread `...data` expande os campos de `data`, e `userId` é adicionado em seguida. Se `data` já tivesse `userId`, ele seria sobrescrito — mas como o tipo remove `userId`, isso não é possível.

---

### Verificação de propriedade: `contact.userId !== userId`

```ts
async update(id: string, userId: string, data: ContactUpdate): Promise<Contact> {
    const contact = await this.contactRepository.findById(id);
    if (!contact) {
        throw new AppError("Contato não encontrado", 404);
    }
    if (contact.userId !== userId) {
        throw new AppError("Acesso negado", 403);
    }
    return this.contactRepository.update(id, data);
}
```

Esta verificação implementa **autorização no nível de recurso**: não basta o usuário estar autenticado, ele precisa ser **o dono do contato** para modificá-lo.

**Por que isso é necessário?** Sem essa verificação, qualquer usuário autenticado poderia atualizar ou deletar contatos de outros usuários:

```http
DELETE /contacts/abc-123
email: atacante@email.com
password: senha-do-atacante
```

Se `abc-123` é um contato de outro usuário, a rota o deletaria sem reclamar.

A verificação compara o `userId` do contato (dono real) com o `userId` do usuário autenticado (quem está fazendo a requisição). Se forem diferentes, lança `AppError("Acesso negado", 403)`.

**HTTP 403 Forbidden** — diferente de 401 Unauthorized. O 401 significa "não sei quem você é". O 403 significa "sei quem você é, mas você não tem permissão". O cliente está autenticado, mas não tem direito sobre aquele recurso específico.

---

## Single Responsibility Principle (SOLID — S)

Cada use case tem uma responsabilidade clara e única:

- `UserUseCase.create` — cria um usuário verificando duplicidade de email
- `UserUseCase.findById` — busca um usuário ou lança "não encontrado"
- `ContactUseCase.update` — atualiza um contato verificando existência e propriedade

Nenhum método faz mais de uma coisa. Isso torna o código previsível: quando há um bug na criação de usuários, o escopo de investigação é `UserUseCase.create` e seus colaboradores diretos.
