# Totem — casca nativa Android

App Android que mostra o cardápio (`/mesa/`) num WebView e cobra por
aproximação usando o SDK de Tap to Pay da SumUp.

## Por que isso existe

O Tap to Pay não é acessível pelo navegador nem pelo Payment Switch
(`sumupmerchant://`) da SumUp — pelo URL scheme só aparecem maquininha
Bluetooth, Payment Links e Pix, mesmo com o Tap to Pay ativo na conta
([issue #38](https://github.com/sumup/sumup-android-api/issues/38)). O único
caminho para o cliente aproximar o cartão no próprio tablet é o SDK nativo,
que exige um app Android.

Todo o cardápio, carrinho e pedido continuam no app web. Esta casca só:

1. carrega o cardápio num WebView;
2. expõe `window.AndroidTapToPay` para o app web pedir a cobrança;
3. chama o SDK e devolve o resultado em `window.__onTapToPayResult`.

A confirmação do pedido continua sendo feita no servidor
(`/api/sumup-confirm-payment`), que acha a transação pelo
`foreignTransactionId` — o resultado que a ponte devolve serve só para a
interface reagir.

## Pré-requisitos

- Android Studio (ou Gradle 8+) e JDK 17
- Tablet com NFC e **Android 11+** (minSdk 30)
- Conta SumUp com **Tap to Pay ativado** (Configurações → "Tap to Pay no Android")
- Credenciais do Maven privado do SDK — peça pelo formulário do
  [developer portal](https://developer.sumup.com/) ou em `integration@sumup.com`

## Configuração

Crie `android/local.properties` (já está no `.gitignore`):

```properties
sdk.dir=C\:\\Users\\SEU-USUARIO\\AppData\\Local\\Android\\Sdk

# Credenciais do Maven privado do SDK de Tap to Pay
sumupTtpMavenUser=USUARIO-FORNECIDO-PELA-SUMUP
sumupTtpMavenPassword=SENHA-FORNECIDA-PELA-SUMUP

# Chave de API da SumUp (developer.sumup.com > Chaves de API)
sumupApiKey=sup_sk_sua-chave-secreta

# URL do cardápio publicado
menuUrl=https://SEU-DOMINIO.vercel.app/mesa/
```

## Build

O SDK faz *attestation* do aparelho e **recusa rodar em build depurável**, com
root ou com depuração USB ligada. Ou seja: pagamento real só em build de
release assinada, e com as Opções de Desenvolvedor **desativadas** no tablet.

```bash
./gradlew assembleRelease
```

Instale o APK gerado no tablet e desative as Opções de Desenvolvedor antes de
testar uma cobrança.

Para testar sem mover dinheiro, crie uma conta sandbox em Developer Settings no
painel da SumUp.

## Nota de segurança

A chave de API vai dentro do APK. Ela fica fora do git, mas um APK pode ser
descompilado — então o tablet do totem precisa ser um aparelho controlado pelo
estabelecimento, não um aparelho pessoal ou compartilhado. Se isso virar um
problema, o caminho é trocar `AuthTokenProvider` por uma chamada a um endpoint
próprio que devolve um token de curta duração, em vez de embutir a chave.

## Ponto de atenção na primeira build

Os nomes de classe e pacote do SDK em `TapToPayBridge.kt` vieram da
documentação pública, não de uma compilação real (o artefato está num Maven
privado). Na primeira build, confira os imports e a assinatura de
`CheckoutData` contra o SDK e o app de exemplo em
[sumup-android-tap-to-pay](https://github.com/sumup/sumup-android-tap-to-pay).
O fluxo está correto; o que pode variar são nomes.
