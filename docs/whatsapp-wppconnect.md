# WhatsApp com WPPConnect

O PromoPilot 360 integra com o WPPConnect Server para enviar mensagens programadas para grupos do WhatsApp via sessao autenticada por QR Code.

## Servico WPPConnect

Para desenvolvimento local, suba o servico junto com PostgreSQL e Redis:

```bash
docker compose up -d postgres redis wppconnect
```

O WPPConnect ficara disponivel em:

```text
http://localhost:21465
```

No Render, hospede o WPPConnect como um servico web separado baseado em Docker e configure um disco persistente para os tokens da sessao sempre que possivel. Depois, configure a API do PromoPilot com a URL publica desse servico.

## Variaveis

```env
WPP_SERVER_URL=https://seu-wppconnect.onrender.com
WPP_SESSION_NAME=promopilot360
WPP_SECRET_KEY=sua-chave-secreta-do-wppconnect
WHATSAPP_DEFAULT_INTERVAL_SECONDS=60
WHATSAPP_DAILY_LIMIT=100
WHATSAPP_MAX_CONSECUTIVE_FAILURES=5
```

## Fluxo no sistema

1. Acesse `WhatsApp`.
2. Cadastre uma conexao `WPPConnect Server`.
3. Informe `URL da API` e `Secret key`.
4. Clique em `Conectar` e leia o QR Code.
5. Use `Listar grupos da sessao` ou cadastre manualmente o ID do grupo.
6. Selecione os grupos na campanha.
7. Ative a campanha para o worker enviar nos horarios programados.

## Regras de uso

O WPPConnect usa WhatsApp Web por uma biblioteca nao oficial. Use intervalos, limites diarios e grupos cadastrados manualmente. O PromoPilot nao captura membros, nao adiciona participantes e nao faz scraping de contatos.
