package com.marineknows.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.view.inputmethod.EditorInfo
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.marineknows.app.databinding.ActivityMainBinding

/**
 * Single-activity WebView wrapper around a self-hosted Marine Knows site.
 *
 * On first launch (no server saved yet) the user is asked for the address
 * of their install - the URL is never hard-coded, since every Marine Knows
 * deployment lives at whatever IP/hostname the Proxmox host gave it. The
 * address is stored in SharedPreferences and reused on every later launch;
 * it can be changed again at any time from the overflow menu.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: SharedPreferences
    private var currentUrl: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        configureWebView()
        wireUpSetupForm()
        wireUpErrorScreen()
        wireBackNavigation()

        val saved = prefs.getString(KEY_SERVER_URL, null)
        if (saved.isNullOrBlank()) {
            showSetup(prefill = false)
        } else {
            loadServer(saved)
        }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_reload -> {
                binding.webview.reload()
                true
            }
            R.id.action_change_server -> {
                showSetup(prefill = true)
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    // ---------- WebView ----------

    private fun configureWebView() {
        val webView = binding.webview
        webView.setBackgroundColor(ContextCompat.getColor(this, R.color.bg))
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true // required: the site persists the chosen theme in localStorage
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false) // the site is already responsive and the network explorer has its own pinch-zoom
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                super.onPageFinished(view, url)
                binding.progressBar.visibility = View.GONE
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                super.onReceivedError(view, request, error)
                if (request.isForMainFrame) {
                    showError()
                }
            }

            // Keep navigation within the configured server inside the WebView;
            // send links to other hosts (e.g. a "Source: imo.org" reference
            // link) out to the system browser instead of trapping the user.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val targetHost = request.url.host
                val serverHost = currentUrl?.let { Uri.parse(it).host }
                if (targetHost != null && targetHost != serverHost) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    } catch (e: ActivityNotFoundException) {
                        // no browser available - fall through and let the WebView try
                        return false
                    }
                    return true
                }
                return false
            }
        }
    }

    private fun loadServer(url: String) {
        currentUrl = url
        showWebView()
        binding.errorContainer.visibility = View.GONE
        binding.progressBar.visibility = View.VISIBLE
        binding.webview.loadUrl(url)
    }

    // ---------- Setup screen ----------

    private fun wireUpSetupForm() {
        binding.connectButton.setOnClickListener { attemptConnect() }
        binding.urlInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO) {
                attemptConnect()
                true
            } else {
                false
            }
        }
    }

    private fun attemptConnect() {
        val raw = binding.urlInput.text?.toString().orEmpty()
        val normalized = normalizeServerUrl(raw)
        if (normalized == null) {
            binding.urlInput.error = if (raw.isBlank()) {
                getString(R.string.setup_error_empty)
            } else {
                getString(R.string.setup_error_invalid)
            }
            return
        }
        prefs.edit().putString(KEY_SERVER_URL, normalized).apply()
        loadServer(normalized)
    }

    private fun normalizeServerUrl(input: String): String? {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return null
        val withScheme = if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            trimmed
        } else {
            "http://$trimmed"
        }
        val uri = Uri.parse(withScheme)
        if (uri.host.isNullOrBlank()) return null
        return withScheme
    }

    private fun showSetup(prefill: Boolean) {
        binding.urlInput.setText(if (prefill) currentUrl.orEmpty() else "")
        binding.urlInput.error = null
        binding.setupContainer.visibility = View.VISIBLE
        binding.webContainer.visibility = View.GONE
    }

    private fun showWebView() {
        binding.setupContainer.visibility = View.GONE
        binding.webContainer.visibility = View.VISIBLE
    }

    // ---------- Error screen ----------

    private fun wireUpErrorScreen() {
        binding.retryButton.setOnClickListener { currentUrl?.let { loadServer(it) } }
        binding.errorChangeServerButton.setOnClickListener { showSetup(prefill = true) }
    }

    private fun showError() {
        binding.progressBar.visibility = View.GONE
        val host = currentUrl?.let { Uri.parse(it).host } ?: currentUrl.orEmpty()
        binding.errorBody.text = getString(R.string.error_body, host)
        binding.errorContainer.visibility = View.VISIBLE
    }

    // ---------- Back navigation ----------

    private fun wireBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val webView = binding.webview
                if (binding.webContainer.visibility == View.VISIBLE && webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    companion object {
        private const val PREFS_NAME = "marine_knows_prefs"
        private const val KEY_SERVER_URL = "server_url"
    }
}
