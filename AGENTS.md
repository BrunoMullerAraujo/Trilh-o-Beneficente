# Diretrizes do Sistema de Inscrições Beneficentes

## Visão Geral
Este sistema foi projetado para ser 100% gratuito em termos de hospedagem e infraestrutura, utilizando o Firebase (Spark Plan) e Cloud Run.

## Regras de Negócio
- As inscrições são confirmadas automaticamente via Webhook do Mercado Pago.
- O organizador deve configurar o `MERCADO_PAGO_ACCESS_TOKEN` no painel de segredos.
- O organizador deve configurar o `MERCADO_PAGO_WEBHOOK_SECRET` para validar a assinatura `x-signature` dos webhooks.
- O campo `status` das inscrições é salvo internamente em inglês e pode ser: `pending`, `approved`, `cancelled`.
- A interface deve traduzir esses status para português: `Pendente`, `Pago/Aprovado`, `Cancelado`.
- A configuração principal do evento deve ficar em `events/main`, incluindo título, descrição, data, meta, cotas permitidas, status ativo e texto dos termos.
- O valor da inscrição deve respeitar as cotas configuradas no evento ativo.

## Segurança
- O roteamento de webhook deve validar a assinatura ou o ID do pagamento consultando a API oficial do Mercado Pago para evitar fraudes.
- Quando `MERCADO_PAGO_WEBHOOK_SECRET` estiver configurado, o webhook deve validar `x-signature` usando HMAC SHA-256 antes de consultar e sincronizar pagamentos.
- O isolamento multi-tenant (se implementado) deve ser garantido via regras de segurança do Firestore.
