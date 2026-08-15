# Parear a maquininha Solo com o totem

O totem cobra pela **Cloud API** da SumUp: o servidor manda a cobrança e a
maquininha ao lado do tablet acende sozinha pedindo a aproximação do cartão. O
cliente não escolhe forma de pagamento nem sai do cardápio.

Para isso o servidor precisa saber **qual** maquininha é a dele — o
`SUMUP_READER_ID`. Isso se faz uma vez, parenado o aparelho.

## 1. Pegar o código de pareamento na maquininha

Na Solo: **Configurações → Conectar/Integrações → Parear com API** (o caminho
varia com a versão do firmware). O aparelho mostra um código alfanumérico de
8 ou 9 caracteres.

O código expira rápido — deixe o passo 2 pronto antes de gerá-lo.

## 2. Registrar a maquininha

Troque `SEU-MERCHANT-CODE`, `sup_sk_...` e `CODIGO-DA-TELA`:

```bash
curl -X POST "https://api.sumup.com/v0.1/merchants/SEU-MERCHANT-CODE/readers" \
  -H "Authorization: Bearer sup_sk_SUA-CHAVE-SECRETA" \
  -H "Content-Type: application/json" \
  -d '{"pairing_code":"CODIGO-DA-TELA","name":"Totem Forest Acai"}'
```

A resposta traz o `id` da maquininha:

```json
{ "id": "rdr_XXXXXXXXXXXXXXXXXXXXXXXXXX", "status": "paired", "device": { "model": "solo" } }
```

Se `status` vier como `processing`, consulte de novo até virar `paired`:

```bash
curl "https://api.sumup.com/v0.1/merchants/SEU-MERCHANT-CODE/readers" \
  -H "Authorization: Bearer sup_sk_SUA-CHAVE-SECRETA"
```

## 3. Configurar na Vercel

Em Settings → Environment Variables, adicione (e faça um redeploy):

| Variável | Valor |
|---|---|
| `SUMUP_READER_ID` | o `id` do passo 2 |
| `SUMUP_AFFILIATE_KEY` | a affiliate key que você já pediu à SumUp |

`SUMUP_API_KEY` e `SUMUP_MERCHANT_CODE` já devem estar lá.

**As duas juntas ligam o modo maquininha.** Faltando qualquer uma, o totem cai
no checkout hospedado (cliente digita o cartão no navegador), que continua
funcionando — é o comportamento de antes.

> A antiga `VITE_SUMUP_AFFILIATE_KEY` não é mais usada: agora quem fala com a
> SumUp é só o servidor, e a chave deixou de ir no bundle do navegador. Pode
> apagá-la da Vercel.

## 4. Testar

Faça um pedido no cardápio. O esperado:

1. o cardápio mostra "Aproxime o cartão da maquininha";
2. a Solo acende com o valor;
3. ao aproximar o cartão, o cardápio vai sozinho para a confirmação e o pedido
   aparece no painel da cozinha.

Se a maquininha não acender, confira nesta ordem: `SUMUP_READER_ID` correto, a
Solo ligada e com internet própria (WiFi ou chip), e o status dela:

```bash
curl "https://api.sumup.com/v0.1/merchants/SEU-MERCHANT-CODE/readers/SEU-READER-ID/status" \
  -H "Authorization: Bearer sup_sk_SUA-CHAVE-SECRETA"
```

## Observações

- **Moeda:** hoje a cobrança sai em **BRL** (testes). Antes de abrir ao público
  troque `CURRENCY` em `api/sumup-create-checkout.ts` para `CHF`.
- **Crédito/débito:** `card_type` é obrigatório só no Brasil e no Chile, e está
  fixo em `debit` no mesmo arquivo. Na Suíça o campo é ignorado.
- **Uma maquininha por totem.** Com mais de um totem, cada um precisa do seu
  `SUMUP_READER_ID` — senão dois pedidos disputam o mesmo aparelho.
