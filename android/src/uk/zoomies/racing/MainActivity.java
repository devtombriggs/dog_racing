package uk.zoomies.racing;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Zoomies Racing on a TV: the deployed game in a full-screen web view.  The game itself knows it is on a TV from
 * the user agent ("ZoomiesTV"; src/tv.js): it lets the remote move round the menus, hides full screen, and shows
 * the frame rate.
 *
 *   Back (remote)    the game's own back: the race menu in a race, closes a pop-up, back a screen; on the
 *                    home screen it leaves the app
 *   Menu (remote)    the race menu
 *   B (controller)   left to the game (menuPad.js reads the controller itself), so it is never a second Back
 */
public class MainActivity extends Activity {
    private WebView web;
    private String home;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        home = getString(R.string.game_url);

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(20, 34, 79));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);                    // (the volume, the guest name...)
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);   // (the music starts on GO, not on a tap)
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setUserAgentString(settings.getUserAgentString() + " ZoomiesTV/" + BuildInfo.VERSION);
        CookieManager.getInstance().setAcceptCookie(true);      // (signed in stays signed in)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline(String.valueOf(error.getDescription()));
            }
        });
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        setContentView(web);
        web.requestFocus();

        if (saved != null) web.restoreState(saved);
        else web.loadUrl(home);
    }

    private void showOffline(String why) {
        String page = "<html><body style=\"margin:0;height:100vh;display:grid;place-items:center;background:#14224f;color:#fff;"
            + "font:24px sans-serif;text-align:center\"><div><h1>Can't reach Zoomies Racing</h1><p>" + escape(why) + "</p>"
            + "<p>Check the internet connection, then press the middle button to try again.</p>"
            + "<button autofocus style=\"font-size:24px;padding:12px 32px;border-radius:999px;border:0;background:#ffd22e\" "
            + "onclick=\"location.href='" + escape(home) + "'\">Try again</button></div></body></html>";
        web.loadDataWithBaseURL(null, page, "text/html", "utf-8", null);
    }

    private static String escape(String text) {
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("'", "&#39;").replace("\"", "&quot;");
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        boolean fromPad = (event.getSource() & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
            || (event.getSource() & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
        // A controller's buttons go to the game (the Gamepad API) and nowhere else: unhandled, Android turns B into Back
        if (fromPad && KeyEvent.isGamepadButton(code)) {
            web.dispatchKeyEvent(event);
            return true;
        }
        if (code == KeyEvent.KEYCODE_BACK || code == KeyEvent.KEYCODE_MENU) {
            if (event.getAction() == KeyEvent.ACTION_UP) {
                if (code == KeyEvent.KEYCODE_MENU) web.evaluateJavascript("window.zoomiesTv && window.zoomiesTv.menu()", null);
                else back();
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    // The game's own back (src/tv.js); when there is nowhere further back to go, the app goes to the background
    private void back() {
        web.evaluateJavascript("window.zoomiesTv ? window.zoomiesTv.back() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String result) {
                if ("true".equals(result)) return;
                if (web.canGoBack() && !String.valueOf(web.getUrl()).startsWith(home)) web.goBack();
                else moveTaskToBack(true);
            }
        });
    }

    @Override
    public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onDestroy() { web.destroy(); super.onDestroy(); }
}
