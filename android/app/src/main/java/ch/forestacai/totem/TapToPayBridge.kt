package ch.forestacai.totem

import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.sumup.taptopay.AuthTokenProvider
import com.sumup.taptopay.TapToPayApiProvider
import com.sumup.taptopay.model.AffiliateData
import com.sumup.taptopay.model.CheckoutData
import com.sumup.taptopay.model.PaymentEvent
import com.sumup.taptopay.model.ProcessCardAs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Ponte entre o cardápio (WebView) e o SDK de Tap to Pay da SumUp.
 *
 * ATENÇÃO: os nomes de classe/pacote do SDK abaixo vieram da documentação
 * pública, não de uma compilação real — o artefato está num Maven privado que
 * exige credenciais. Na primeira build, confira os imports e a assinatura de
 * `CheckoutData` contra o SDK e o app de exemplo em
 * github.com/sumup/sumup-android-tap-to-pay. A lógica de fluxo já está certa;
 * o que pode variar são nomes.
 *
 * Contrato com o app web (ver src/mesa/sumupTapToPay.ts):
 *   window.AndroidTapToPay.isAvailable()      -> "true"
 *   window.AndroidTapToPay.startPayment(json) -> dispara a cobrança
 *   window.__onTapToPayResult({ status, txCode, message })  <- resposta
 */
class TapToPayBridge(
  private val activity: AppCompatActivity,
  private val webView: WebView,
) {
  companion object {
    const val JS_NAME = "AndroidTapToPay"
  }

  private val tapToPay = TapToPayApiProvider.provide(activity.applicationContext)

  /** O SDK pede o token de acesso quando precisa; aqui usamos a chave de API. */
  private val authTokenProvider = object : AuthTokenProvider {
    override fun getAccessToken(): String = BuildConfig.SUMUP_API_KEY
  }

  /** Abre a sessão do SDK uma vez, logo na subida do app. */
  fun initSdk() {
    activity.lifecycleScope.launch {
      val result = withContext(Dispatchers.IO) { tapToPay.init(authTokenProvider) }
      if (result.isFailure) {
        // Sem sessão não há cobrança: o cardápio cai no aviso de indisponível.
        postResult("failed", null, result.exceptionOrNull()?.message ?: "init failed")
      }
    }
  }

  @JavascriptInterface
  fun isAvailable(): String = "true"

  /**
   * Recebe { orderId, total, processCardAs } do app web. `total` vem em francos
   * (ou reais, durante os testes) e o SDK cobra em unidades menores, por isso a
   * conversão para centavos.
   */
  @JavascriptInterface
  fun startPayment(payload: String) {
    val json = JSONObject(payload)
    val orderId = json.getString("orderId")
    val minorUnits = Math.round(json.getDouble("total") * 100)
    // Obrigatório no Brasil e no Chile; ignorado nos demais países.
    val processCardAs = when (json.optString("processCardAs").uppercase()) {
      "CREDIT" -> ProcessCardAs.Credit
      "DEBIT" -> ProcessCardAs.Debit
      else -> null
    }

    activity.lifecycleScope.launch {
      runCatching {
        val checkout = CheckoutData(
          totalAmount = minorUnits,
          clientUniqueTransactionId = orderId,
          processCardAs = processCardAs,
          // `foreignTransactionId` é o que /api/sumup-confirm-payment usa para
          // achar a transação e confirmar o pedido do lado do servidor.
          affiliateData = AffiliateData(foreignTransactionId = orderId),
        )
        tapToPay.startPayment(checkout, skipSuccessScreen = true).collect { event ->
          when (event) {
            is PaymentEvent.TransactionDone ->
              postResult("success", event.paymentOutput?.txCode, null)
            is PaymentEvent.TransactionFailed ->
              postResult("failed", null, event.exception?.message ?: "transaction failed")
            is PaymentEvent.TransactionCanceled ->
              postResult("canceled", null, null)
            is PaymentEvent.TransactionResultUnknown ->
              // Pode ter passado: quem decide é a consulta no servidor.
              postResult("unknown", null, null)
            else -> Unit // eventos de progresso (cartão pedido/apresentado, CVM)
          }
        }
      }.onFailure {
        postResult("failed", null, it.message ?: "unexpected error")
      }
    }
  }

  fun tearDown() {
    activity.lifecycleScope.launch {
      runCatching { tapToPay.tearDown() }
    }
  }

  private fun postResult(status: String, txCode: String?, message: String?) {
    val json = JSONObject()
      .put("status", status)
      .put("txCode", txCode ?: JSONObject.NULL)
      .put("message", message ?: JSONObject.NULL)
    webView.post {
      webView.evaluateJavascript("window.__onTapToPayResult && window.__onTapToPayResult($json)", null)
    }
  }
}
