import java.util.Properties

plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

// Segredos ficam fora do git: local.properties (ignorado) ou variáveis de
// ambiente na máquina que faz o build.
val localProps = Properties().apply {
  val f = rootProject.file("local.properties")
  if (f.exists()) f.inputStream().use { load(it) }
}
fun secret(name: String, env: String): String =
  localProps.getProperty(name) ?: System.getenv(env) ?: ""

android {
  namespace = "ch.forestacai.totem"
  compileSdk = 34

  defaultConfig {
    applicationId = "ch.forestacai.totem"
    // O SDK de Tap to Pay exige Android 11+.
    minSdk = 30
    targetSdk = 34
    versionCode = 1
    versionName = "1.0"

    // URL do cardápio que a casca nativa carrega no WebView.
    buildConfigField("String", "MENU_URL", "\"${secret("menuUrl", "MENU_URL")}\"")
    // Chave de API da SumUp usada para autenticar o SDK. Fica fora do git, mas
    // note que ela vai dentro do APK: o tablet do totem precisa ser um aparelho
    // controlado pelo estabelecimento. Ver a nota de segurança no README.
    buildConfigField("String", "SUMUP_API_KEY", "\"${secret("sumupApiKey", "SUMUP_API_KEY")}\"")
  }

  buildFeatures {
    buildConfig = true
  }

  buildTypes {
    release {
      // O SDK faz attestation do aparelho e recusa rodar em build depurável,
      // com root ou com depuração USB ligada. Pagamento real só em release.
      isMinifyEnabled = false
      isDebuggable = false
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
    isCoreLibraryDesugaringEnabled = true
  }
  kotlinOptions {
    jvmTarget = "17"
  }
}

dependencies {
  implementation("com.sumup.tap-to-pay:utopia-sdk:1.1.5")
  coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")

  implementation("androidx.core:core-ktx:1.13.1")
  implementation("androidx.appcompat:appcompat:1.7.0")
  implementation("androidx.activity:activity-ktx:1.9.2")
  implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}
