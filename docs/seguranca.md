# Seguranca

Regras obrigatorias:

- Nao versionar `.env`.
- Nao salvar senha de marketplace.
- Nao logar tokens, senhas ou chaves completas.
- Mascarar credenciais na UI.
- Usar tokens oficiais, OAuth, APIs e variaveis de ambiente.
- Criptografar credenciais persistidas.
- Nao automatizar login de marketplaces.
- Nao burlar CAPTCHA, rate limit ou bloqueio.
- Nao automatizar WhatsApp Web.

## Criptografia

A API usa `ENCRYPTION_KEY` para derivar uma chave AES-256-GCM. Troque o valor padrao antes de usar dados reais.

## Analytics

Cliques registram user-agent, referer e hash de IP. IP bruto nao e persistido.
