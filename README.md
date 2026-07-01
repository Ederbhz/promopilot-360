# PromoPilot 360

Garimpo inteligente de ofertas no piloto automatico.

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS.
- Backend: Express, TypeScript, Prisma, PostgreSQL.
- Filas: Redis com BullMQ para publicacoes agendadas.
- Integracoes: conectores Awin/Natura, Shopee, Mercado Livre, Magalu e Manual.

## Requisitos

- Node.js 20+
- pnpm 9+
- Docker com Docker Compose para PostgreSQL e Redis

## Primeira execucao

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Frontend: http://localhost:3000  
API: http://localhost:4000

## Rodar no GitHub Codespaces

1. Suba este projeto para um repositorio no GitHub.
2. Abra o repositorio no GitHub.
3. Clique em **Code > Codespaces > Create codespace**.
4. Aguarde o `postCreateCommand` instalar dependencias e gerar Prisma Client.
5. Rode:

```bash
pnpm dev
```

O Codespaces sobe PostgreSQL e Redis pelo Docker Compose do projeto. As portas `3000` e `4000` ficam encaminhadas pelo proprio GitHub.

## Publicar frontend no GitHub Pages

O workflow esta em:

```text
.github/workflows/pages.yml
```

Ele publica apenas o frontend estatico do Next.js. Para login, dashboard, campanhas, Telegram e dados reais funcionarem fora do Codespaces, a API precisa estar hospedada em outro servico e o repositorio deve ter a variable:

```text
NEXT_PUBLIC_API_URL=https://sua-api.example.com
```

No GitHub:

1. Va em **Settings > Pages**.
2. Em **Build and deployment**, escolha **GitHub Actions**.
3. Va em **Settings > Secrets and variables > Actions > Variables**.
4. Crie `NEXT_PUBLIC_API_URL` apontando para a API publicada.
5. Faça push na branch `main` ou rode o workflow manualmente.

Se essa variavel nao existir, o frontend publicado tentara chamar `http://localhost:4000`, que so funciona em ambiente local/Codespaces.

## Hospedar API no Render

O Blueprint do Render esta em:

```text
render.yaml
```

Ele cria:

- Web Service `promopilot360-api`
- Render Postgres `promopilot360-postgres`
- Render Key Value `promopilot360-redis`

No Render:

1. Conecte o repositorio GitHub.
2. Escolha **New > Blueprint**.
3. Selecione este repositorio.
4. Informe as variaveis marcadas como `sync: false`.
5. Crie o Blueprint.

Variaveis obrigatorias para o primeiro deploy:

```text
APP_URL=https://SEU_USUARIO.github.io/promopilot-360
CORS_ALLOWED_ORIGINS=https://SEU_USUARIO.github.io/promopilot-360
API_URL=https://promopilot360-api.onrender.com
DEFAULT_ADMIN_EMAIL=seu-email
DEFAULT_ADMIN_PASSWORD=sua-senha-forte
```

Depois que o Render gerar a URL real da API, volte ao GitHub e defina:

```text
NEXT_PUBLIC_API_URL=https://URL-REAL-DA-API.onrender.com
```

Em seguida, rode novamente o workflow de GitHub Pages para o frontend apontar para a API publicada.

Usuario inicial definido em `.env`:

```env
DEFAULT_ADMIN_EMAIL=admin@promopilot.local
DEFAULT_ADMIN_PASSWORD=promopilot123
```

## Scripts

```bash
pnpm dev              # web + api
pnpm dev:web          # somente Next.js
pnpm dev:api          # somente API
pnpm build            # build de producao
pnpm typecheck        # checagem TypeScript
pnpm db:generate      # gera Prisma Client
pnpm db:migrate       # aplica migrations
pnpm db:seed          # seed de admin, marketplaces e templates
```

## MVP Entregue

- Login administrativo com JWT.
- Cadastro/listagem de marketplaces.
- Contas de afiliado com credenciais criptografadas.
- Cadastro manual de oferta por URL.
- Extracao publica basica por metadados HTML.
- Geracao manual/assistida de link afiliado.
- Templates editaveis e preview.
- Geracao de mensagens promocionais.
- Campanhas com intervalo e limite diario.
- Fila de publicacoes.
- Envio automatico para Telegram via Bot API.
- WhatsApp assistido: copiar mensagem, publicar manualmente e marcar envio.
- Historico de publicacoes, logs, links curtos e cliques.
- Dashboard e relatorios.

## Seguranca

- Nao coloque senhas ou tokens reais no codigo.
- Use `.env` local para segredos.
- Tokens de afiliado devem ficar em variaveis de ambiente ou credenciais criptografadas no banco.
- WhatsApp Web nao e automatizado. O MVP usa fluxo assistido.
- Scraping com login, bypass de CAPTCHA e automacao insegura nao fazem parte do projeto.

## Observacoes de Integracao

Os conectores de Awin/Natura e Shopee ja estao isolados por adapter, mas chamadas comerciais completas dependem de liberacao da conta e tokens oficiais. Mercado Livre e Magalu iniciam em modo assistido/manual, como definido no briefing.
