package br.unesp.cti.nsac.aperture

import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import androidx.core.content.ContextCompat
import com.getcapacitor.BridgeActivity

/**
 * Android 12+ (API 31+ / S+) AOSP Dynamic Color Bridge for n²sac.
 *
 * Reads the user's real wallpaper accent palettes from Android AOSP system resources
 * (`android.R.color.system_accent1_500`, `system_accent2_500`, `system_accent3_500`)
 * and injects them into the WebView via `window.__NSAC_ANDROID_DYNAMIC_COLOR__`
 * + dispatches `CustomEvent('nsac:android-dynamic-color', { detail })` on startup
 * and whenever the user changes their wallpaper or switches dark/light theme (`onConfigurationChanged`).
 */
class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        syncAospDynamicColorsToWebView()
    }

    override fun onResume() {
        super.onResume()
        syncAospDynamicColorsToWebView()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        syncAospDynamicColorsToWebView()
    }

    private fun colorIntToHex(color: Int): String =
        String.format("#%06X", 0xFFFFFF and color)

    private fun syncAospDynamicColorsToWebView() {
        val webView = bridge?.webView ?: return
        val nightMask = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        val isSystemDark = nightMask == Configuration.UI_MODE_NIGHT_YES

        val (seedHex, secondaryHex, tertiaryHex) = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val accent1 = ContextCompat.getColor(this, android.R.color.system_accent1_500)
            val accent2 = ContextCompat.getColor(this, android.R.color.system_accent2_500)
            val accent3 = ContextCompat.getColor(this, android.R.color.system_accent3_500)
            Triple(colorIntToHex(accent1), colorIntToHex(accent2), colorIntToHex(accent3))
        } else {
            Triple("#3B82F6", "#60A5FA", "#818CF8")
        }

        val payloadJson = """
            {
              "seedHex": "$seedHex",
              "secondaryHex": "$secondaryHex",
              "tertiaryHex": "$tertiaryHex",
              "isSystemDark": $isSystemDark,
              "source": "android-aosp"
            }
        """.trimIndent()

        val js = """
            (function() {
              window.__NSAC_ANDROID_DYNAMIC_COLOR__ = $payloadJson;
              window.dispatchEvent(new CustomEvent('nsac:android-dynamic-color', { detail: $payloadJson }));
            })();
        """.trimIndent()

        webView.post {
            webView.evaluateJavascript(js, null)
        }
    }
}
