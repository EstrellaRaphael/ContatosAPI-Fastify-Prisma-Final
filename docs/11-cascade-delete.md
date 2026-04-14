# Etapa 11 — Cascade Delete

## Objetivo

Garantir que ao deletar um usuário, todos os seus contatos sejam removidos automaticamente pelo banco de dados — eliminando a necessidade de deleção manual prévia e tornando a operação atômica.

---

## O problema anterior

Na versão inicial do schema, a relação entre `Contact` e `User` não especificava comportamento de deleção:

```prisma
// Antes — sem onDelete
user User @relation(fields: [userId], references: [id])
```

O comportamento padrão do Prisma quando `onDelete` não é especificado é `Restrict` — o banco **recusa** deletar um registro pai que tenha filhos associados. Na prática:

```bash
DELETE /users/abc-123
# → erro de constraint de chave estrangeira se o usuário tiver contatos
# → HTTP 500, mensagem técnica confusa para o cliente
```

Isso obrigava o cliente a deletar todos os contatos manualmente antes de poder deletar o usuário — uma sequência de operações frágil e não-atômica. Se a conexão cair no meio do processo, o sistema fica em estado inconsistente.

---

## A solução: `onDelete: Cascade`

```prisma
// Depois — com cascata
user User @relation(fields: [userId], references: [id], onDelete: Cascade)
```

### O que `onDelete: Cascade` faz

Instrui o banco a **propagar** a deleção: quando um `User` é deletado, o banco automaticamente deleta todos os `Contact` cujo `userId` referencia aquele usuário — na mesma transação, antes de remover o usuário.

```
DELETE FROM users WHERE id = 'abc-123'
  ↓ banco detecta registros dependentes
  ↓ executa automaticamente:
DELETE FROM contacts WHERE userId = 'abc-123'
  ↓ agora sem dependentes:
DELETE FROM users WHERE id = 'abc-123'
  ↓ commit da transação inteira
```

---

## Por que no banco e não na aplicação?

Uma alternativa seria implementar a cascata na camada de aplicação: o use case deletaria os contatos antes de deletar o usuário.

```ts
// Abordagem na aplicação — frágil
async delete(id: string): Promise<User> {
    await this.contactRepository.deleteByUserId(id); // passo 1
    return this.userRepository.delete(id);           // passo 2
}
```

Problemas com essa abordagem:

**1. Não é atômica.** Se o processo cair entre o passo 1 e o passo 2, os contatos foram deletados mas o usuário permanece — estado inconsistente impossível de detectar automaticamente.

**2. Race conditions.** Entre o passo 1 e o passo 2, outra requisição pode criar um contato para aquele usuário. O usuário seria deletado deixando o contato órfão (com `userId` inválido).

**3. Duplicação de responsabilidade.** A integridade referencial é responsabilidade do banco de dados — é para isso que chaves estrangeiras existem. Replicar essa lógica na aplicação viola o princípio de responsabilidade única.

Com `onDelete: Cascade`, a operação é uma única instrução SQL executada atomicamente. O banco garante que o estado final é sempre consistente.

---

## Opções de `onDelete` no Prisma

O Prisma suporta cinco comportamentos ao deletar um registro pai:

| Valor | Comportamento | Quando usar |
|---|---|---|
| `Restrict` | **Recusa** a deleção se houver filhos | Quando filhos órfãos são um erro crítico |
| `NoAction` | Igual a Restrict, verificado diferente | Alguns bancos tratam diferente do Restrict |
| `Cascade` | **Propaga** a deleção para todos os filhos | Quando filhos sem pai não fazem sentido |
| `SetNull` | Define a FK dos filhos como `NULL` | Quando filhos podem existir sem pai |
| `SetDefault` | Define a FK dos filhos para o valor default | Casos específicos com valores padrão de FK |

Para o modelo `Contact`, faz sentido usar `Cascade`: um contato sem usuário dono não tem significado na aplicação. Se o usuário é removido, os contatos devem ser removidos também.

---

## Aplicando a migration

Após alterar o `schema.prisma`, é necessário criar e aplicar uma nova migration para que o banco reflita a mudança:

```bash
npx prisma migrate dev --name add-cascade-delete
```

### O que Prisma gera para SQLite

O SQLite não suporta `ALTER TABLE ... ADD CONSTRAINT` — não é possível adicionar constraints de chave estrangeira a tabelas existentes. O Prisma contorna isso **recriando a tabela** com a constraint correta:

```sql
-- Gerado automaticamente pelo Prisma
-- RedefineTables
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_contacts" (
    "id"        TEXT     NOT NULL PRIMARY KEY,
    "name"      TEXT     NOT NULL,
    "email"     TEXT,
    "phone"     TEXT     NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId"    TEXT     NOT NULL,
    CONSTRAINT "contacts_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_contacts" SELECT * FROM "contacts";
DROP TABLE "contacts";
ALTER TABLE "new_contacts" RENAME TO "contacts";

PRAGMA foreign_keys=ON;
```

**`PRAGMA foreign_keys=OFF`** — desativa temporariamente as constraints de FK durante a recriação. Sem isso, o `INSERT INTO new_contacts SELECT * FROM contacts` falharia porque a tabela `users` referenciada ainda não foi recriada.

**`INSERT INTO "new_contacts" SELECT * FROM "contacts"`** — copia todos os dados existentes para a nova tabela. Os dados são preservados.

**`PRAGMA foreign_keys=ON`** — reativa as constraints. A partir daqui, `DELETE FROM users` com filhos em `contacts` executa a cascata.

### `ON DELETE CASCADE ON UPDATE CASCADE`

O `ON UPDATE CASCADE` é adicionado automaticamente pelo Prisma junto com o `ON DELETE CASCADE`. Ele propaga atualizações do valor da PK do pai para a FK do filho — se o `id` do usuário mudasse, o `userId` dos contatos seria atualizado automaticamente. Como IDs são UUIDs imutáveis neste projeto, esse comportamento nunca será acionado, mas é boa prática incluir.

---

## Efeito observável após a migration

```bash
# Criar um usuário e dois contatos
curl -X POST http://localhost:3100/users -d '{"name":"Ana","email":"ana@test.com","password":"123456"}'
# → { "id": "user-uuid-aqui", ... }

curl -X POST http://localhost:3100/contacts \
  -H "email: ana@test.com" -H "password: 123456" \
  -d '{"name":"Contato A","phone":"11999990001"}'

curl -X POST http://localhost:3100/contacts \
  -H "email: ana@test.com" -H "password: 123456" \
  -d '{"name":"Contato B","phone":"11999990002"}'

# Deletar o usuário diretamente — sem precisar deletar contatos antes
curl -X DELETE http://localhost:3100/users/<ID_DA_ANA> \
  -H "email: <admin@email.com>" \
  -H "password: <senha-admin>"
# → HTTP 200, dados da Ana retornados

# Verificar no Prisma Studio: contatos de Ana desapareceram também
npx prisma studio
```

---

## Considerações de segurança

A cascata é uma operação irreversível. Deletar um usuário com muitos contatos remove silenciosamente todos eles em um único comando. Em sistemas de produção, algumas estratégias mitigam isso:

- **Soft delete** — em vez de `DELETE`, setar um campo `deletedAt: DateTime?`. O registro permanece no banco mas é filtrado nas queries. Permite recuperação.
- **Auditoria** — registrar em uma tabela de log os registros deletados antes da remoção.
- **Confirmação explícita** — exigir que o cliente informe `{ "confirmar": true }` no body do DELETE para operações destrutivas em cascata.

Para este projeto educacional, a cascata direta é adequada e demonstra o conceito com clareza.
