pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}

dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    google()
    mavenCentral()

    // SDK de Tap to Pay da SumUp. O repositório é privado: peça usuário e senha
    // pelo formulário do developer portal (ou integration@sumup.com) e guarde em
    // local.properties / variáveis de ambiente — nunca versione as credenciais.
    maven { url = uri("https://maven.sumup.com/releases") }
    maven {
      url = uri("https://tap-to-pay-sdk.fleet.live.sumup.net/")
      credentials {
        username = providers.gradleProperty("sumupTtpMavenUser").orNull
          ?: System.getenv("SUMUP_TTP_MAVEN_USERNAME") ?: ""
        password = providers.gradleProperty("sumupTtpMavenPassword").orNull
          ?: System.getenv("SUMUP_TTP_MAVEN_PASSWORD") ?: ""
      }
    }
  }
}

rootProject.name = "ForestAcaiTotem"
include(":app")
