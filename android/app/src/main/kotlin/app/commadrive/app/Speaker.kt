package app.commadrive.app

import android.content.Context
import ai.pleos.playground.tts.TextToSpeech as PleosTts
import ai.pleos.playground.tts.constant.ErrorType
import ai.pleos.playground.tts.constant.Mode
import ai.pleos.playground.tts.listener.OnInitializeListener
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech as AndroidTts
import java.util.Locale

/**
 * 음성 안내 — 주행 중에는 화면 대신 이것이 말한다(DO: 한 줄 + 음성).
 *
 * 1순위는 **Pleos TextToSpeech SDK 의 ON_DEVICE 모드**다. 공식 문서: ON_DEVICE 는 네트워크·앱 등록이 필요 없다
 * (HYBRID·SERVER 는 Playground My Project 자격 증명으로 앱 등록이 필요). 합성된 음성은 차량 오디오로 나간다.
 * Pleos 서비스가 없는 기기에서는 Android 기본 TTS 로 물러난다 — 화면에 어느 쪽인지 적는다.
 */
class Speaker(context: Context) {
    private val app = context.applicationContext
    private val main = Handler(Looper.getMainLooper())

    private var pleos: PleosTts? = null
    @Volatile private var pleosReady = false
    private var fallback: AndroidTts? = null
    @Volatile private var fallbackReady = false

    /** 화면 표시용 — "Pleos TTS(차량)" / "Android TTS(시연)" / "음성 없음". Compose 가 바뀐 값을 다시 그리게 상태로 둔다 */
    var engineLabel by mutableStateOf("음성 준비 중")
        private set

    init {
        runCatching {
            val t = PleosTts(app, Mode.ON_DEVICE)
            t.initialize(object : OnInitializeListener {
                override fun onSuccess() {
                    runCatching { t.setLocale(Locale.KOREA) }
                    pleosReady = true
                    engineLabel = "Pleos TTS (차량 오디오)"
                }
                override fun onFailure(errorType: ErrorType) { useFallback() }
            })
            pleos = t
        }.onFailure { useFallback() }
        // 콜백이 끝내 안 오는 기기도 있다 — 3초 뒤에도 준비가 안 됐으면 기본 TTS 로
        main.postDelayed({ if (!pleosReady) useFallback() }, 3_000)
    }

    /**
     * 기본 엔진부터 붙어 본다. 삼성 폰의 기본 엔진(SamsungTTS)은 허용 목록 밖 앱을 거절한다(실기기 로그로 확인,
     * 2026-10-25) — 그러면 Google TTS 로 한 번 더 시도한다. 차에서는 이 경로를 타지 않는다(Pleos TTS 가 먼저).
     */
    @Synchronized
    private fun useFallback() {
        if (fallback != null || pleosReady) return
        tryEngine(null) { ok -> if (!ok) main.post { tryEngine(GOOGLE_TTS) { ok2 -> if (!ok2 && engineLabel == "음성 준비 중") engineLabel = "음성 없음 — 화면 글자로 안내" } } }
    }

    private fun tryEngine(engine: String?, done: (Boolean) -> Unit) {
        runCatching { fallback?.shutdown() }
        var tts: AndroidTts? = null
        val listener = AndroidTts.OnInitListener { status ->
            val bound = status == AndroidTts.SUCCESS
            // 한국어 음성이 없는 엔진으로 한국어를 읽히면 알아들을 수 없다 — 그럴 바엔 화면 글자만 남긴다
            val ok = bound && tts?.setLanguage(Locale.KOREAN)?.let { it >= AndroidTts.LANG_AVAILABLE } == true
            fallbackReady = ok
            val name = "Android TTS" + if (engine == GOOGLE_TTS) " · Google" else ""
            engineLabel = when {
                ok -> "$name (Pleos TTS 없음)"
                bound -> "$name — 한국어 음성 없음"
                else -> engineLabel
            }
            done(ok)
        }
        tts = if (engine == null) AndroidTts(app, listener) else AndroidTts(app, listener, engine)
        fallback = tts
    }

    fun say(text: String) {
        when {
            pleosReady -> runCatching { pleos?.speak(text, true) }
            fallbackReady -> fallback?.speak(text, AndroidTts.QUEUE_FLUSH, null, "comma")
        }
    }

    private companion object {
        const val GOOGLE_TTS = "com.google.android.tts"
    }

    fun release() {
        runCatching { pleos?.release() }
        runCatching { fallback?.shutdown() }
    }
}
