package ch.forestacai.totem

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

/**
 * Casca nativa do totem: mostra o cardápio (o mesmo app web que roda no
 * navegador) dentro de um WebView e expõe a ponte de pagamento por aproximação.
 *
 * Ela existe por um motivo só: o Tap to Pay não é acessível a partir do
 * navegador nem pelo Payment Switch da SumUp, apenas pelo SDK nativo. Toda a
 * lógica de cardápio, carrinho e pedido continua no app web — aqui só passa
 * a cobrança.
 */
class MainActivity : AppCompatActivity() {

  private lateinit var webView: WebView
  private lateinit var bridge: TapToPayBridge

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    webView = WebView(this).apply {
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      // O cardápio guarda o idioma escolhido em localStorage.
      settings.databaseEnabled = true
      // Mantém a navegação dentro do WebView em vez de abrir o navegador.
      webViewClient = WebViewClient()
    }
    setContentView(webView)

    bridge = TapToPayBridge(this, webView)
    webView.addJavascriptInterface(bridge, TapToPayBridge.JS_NAME)

    bridge.initSdk()
    webView.loadUrl(BuildConfig.MENU_URL)
  }

  /** Totem: esconde barra de status e de navegação para o cliente não sair do app. */
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (!hasFocus) return
    @Suppress("DEPRECATION")
    window.decorView.systemUiVisibility = (
      View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        or View.SYSTEM_UI_FLAG_FULLSCREEN
        or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
      )
  }

  /** Sem botão "voltar": num totem ele só serviria para o cliente se perder. */
  @Suppress("MissingSuperCall", "DEPRECATION")
  override fun onBackPressed() = Unit

  override fun onDestroy() {
    bridge.tearDown()
    super.onDestroy()
  }
}
