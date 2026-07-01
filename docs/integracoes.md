# Integracoes

## Telegram

Usa Bot API oficial.

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_DEFAULT_CHAT_ID=
```

Endpoints:

```http
POST /channels/telegram/test
POST /channels/telegram/send
```

## WhatsApp

O MVP usa fluxo assistido:

- copiar mensagem;
- abrir WhatsApp pelo usuario;
- marcar como enviado.

Nao ha automacao de WhatsApp Web no projeto.

## Marketplaces

- Awin/Natura: link builder preparado por token e publisher id.
- Shopee: adapter preparado para credenciais oficiais.
- Mercado Livre: fluxo assistido com regra opcional de tag validada.
- Magalu: fluxo assistido com loja/configuracao manual.
- Manual: aceita qualquer URL e link afiliado final.
