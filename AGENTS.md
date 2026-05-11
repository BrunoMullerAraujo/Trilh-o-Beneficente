# Diretrizes do Sistema de Inscrições Beneficentes

## Visão Geral
Este sistema foi projetado para ser 100% gratuito em termos de hospedagem e infraestrutura, utilizando o Firebase (Spark Plan) e Cloud Run.

## Regras de Negócio
- As inscrições são confirmadas automaticamente via Webhook do Mercado Pago.
- O organizador deve configurar o `MERCADO_PAGO_ACCESS_TOKEN` no painel de segredos.
- O campo `status` das inscrições pode ser: `pendente`, `aprovado`, `cancelado`.
- O valor da inscrição é fixo ou configurável pelo administrador.

## Segurança
- O roteamento de webhook deve validar a assinatura ou o ID do pagamento consultando a API oficial do Mercado Pago para evitar fraudes.
- O isolamento multi-tenant (se implementado) deve ser garantido via regras de segurança do Firestore.
