# Arquitetura

O PromoPilot 360 usa monorepo com apps e pacotes compartilhados.

```text
apps/web   - Next.js e UI operacional
apps/api   - Express, Prisma, JWT, filas e integracoes
packages/shared - tipos, schemas e calculo de score
packages/marketplace-connectors - adapters de marketplace
packages/message-templates - templates e renderizacao
```

## Fluxo central

1. Usuario cadastra URL ou busca ofertas.
2. API detecta marketplace pelo dominio.
3. Conector extrai metadados publicos ou consulta API oficial.
4. Oferta e produto sao persistidos.
5. Link afiliado e gerado automaticamente quando houver credencial oficial; caso contrario, o fluxo pede link final manual.
6. Template renderiza a mensagem.
7. Campanha cria publicacoes agendadas.
8. BullMQ processa Telegram ou deixa WhatsApp em modo assistido.

## Conectores

Todos implementam `MarketplaceConnector`:

- `searchOffers`
- `extractFromUrl`
- `generateAffiliateLink`
- `validateCoupon` opcional
- `healthCheck`

Essa separacao permite evoluir cada marketplace sem mudar as telas principais.
