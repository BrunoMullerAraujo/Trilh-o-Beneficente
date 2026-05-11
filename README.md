# Sistema de Inscrições Beneficentes

Aplicação React + Express para inscrições beneficentes com pagamento PIX via Mercado Pago, confirmação automática por webhook e gestão administrativa no Firebase/Firestore.

## Requisitos

- Node.js
- Projeto Firebase com Firestore habilitado
- Credenciais do Mercado Pago
- Variáveis de ambiente configuradas conforme [.env.example](.env.example)

## Rodar localmente

1. Instale as dependências:
   `npm install`
2. Crie um `.env` local a partir de `.env.example`.
3. Configure `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` e `APP_URL`.
4. Inicie o servidor:
   `npm.cmd run dev`

No Windows/PowerShell, use `npm.cmd` se a execução de scripts `.ps1` estiver bloqueada.

## Fluxo de pagamento

- O participante cria a inscrição em `/api/registrations/create`.
- O servidor valida dados, cotas permitidas e aceite dos termos.
- A inscrição nasce como `pending` no Firestore.
- O Mercado Pago recebe o pagamento PIX com `external_reference` apontando para a inscrição.
- O webhook `/api/webhook/mercadopago` valida a assinatura quando `MERCADO_PAGO_WEBHOOK_SECRET` está configurado, consulta o pagamento na API oficial e sincroniza o status.

## Configuração do evento

A configuração principal fica em `events/main` no Firestore:

- `title`
- `description`
- `date`
- `targetAmount`
- `allowedAmounts`
- `active`
- `termsText`

Os status internos das inscrições são `pending`, `approved` e `cancelled`; a interface traduz para português.

## Validação antes de publicar

```bash
npm.cmd run lint
npm.cmd run build
```

## Deploy no Cloud Run

O projeto inclui um [Dockerfile](Dockerfile) pronto para Cloud Run. O container usa a porta definida por `PORT`, com fallback local para `3000`.

Antes do deploy, configure os segredos/variáveis do serviço:

- `APP_URL`
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`

Depois de publicar, cadastre no Mercado Pago o webhook:

```text
https://sua-url-do-cloud-run/api/webhook/mercadopago
```

## Segurança

- Inscrições são criadas pelo servidor com Admin SDK.
- O webhook valida `x-signature` com HMAC SHA-256 quando o segredo está configurado.
- Mesmo com webhook assinado, o servidor consulta o pagamento na API oficial do Mercado Pago antes de atualizar a inscrição.
- As regras do Firestore restringem listagem e alterações administrativas a usuários autorizados.
