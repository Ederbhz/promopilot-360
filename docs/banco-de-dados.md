# Banco de Dados

O banco principal e PostgreSQL, gerenciado por Prisma.

Tabelas principais:

- `User`
- `Marketplace`
- `AffiliateAccount`
- `Product`
- `Offer`
- `MessageTemplate`
- `Campaign`
- `ScheduledPost`
- `PublishLog`
- `ShortLink`
- `ClickEvent`
- `IntegrationLog`

## Migrations

A migration inicial esta em:

```text
apps/api/prisma/migrations/20260701133000_init/migration.sql
```

Para aplicar:

```bash
pnpm db:migrate
pnpm db:seed
```

## Dados sensiveis

`AffiliateAccount.encryptedCredentials` guarda JSON criptografado com AES-256-GCM. O IP de cliques e salvo apenas como hash.
