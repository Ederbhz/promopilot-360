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

No Render, o `render.yaml` cria o servico `promopilot360-wppconnect` como Docker no plano gratuito e usa o Key Value/Redis `promopilot360-redis` para guardar os tokens da sessao. A API recebe automaticamente o hostname publico e a `SECRET_KEY` desse servico pelo Blueprint, sem precisar cadastrar URL ou chave na tela.

No plano gratuito, o Render Key Value nao tem persistencia em disco. Isso evita custo mensal, mas se o Redis ou o servico reiniciar em uma condicao que perca memoria, a sessao pode pedir QR Code novamente. Para producao mais estavel, use um Redis/MongoDB persistente ou um disco pago.

## Variaveis

```env
WPP_SERVER_URL=http://localhost:21465
WPP_SERVER_HOSTNAME=
WPP_SESSION_NAME=promopilot360
WPP_SECRET_KEY=THISISMYSECURETOKEN
WPP_TOKEN_STORE=redis
WHATSAPP_DEFAULT_INTERVAL_SECONDS=60
WHATSAPP_DAILY_LIMIT=100
WHATSAPP_MAX_CONSECUTIVE_FAILURES=5
```

## Fluxo no sistema

1. Acesse `WhatsApp`.
2. Cadastre uma conexao WPPConnect com nome, sessao e numero.
3. Clique em `Conectar` e leia o QR Code.
4. Use `Listar grupos da sessao` ou cadastre manualmente o ID do grupo.
5. Selecione os grupos na campanha.
6. Ative a campanha para o worker enviar nos horarios programados.

## Regras de uso

O WPPConnect usa WhatsApp Web por uma biblioteca nao oficial. Use intervalos, limites diarios e grupos cadastrados manualmente. O PromoPilot nao captura membros, nao adiciona participantes e nao faz scraping de contatos.
