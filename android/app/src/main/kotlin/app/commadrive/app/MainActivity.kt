package app.commadrive.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import app.commadrive.app.ui.AppRoot

/**
 * 한 화면짜리 앱 — 단계(여정 · 판단 · 후보 · 주행 중)는 ViewModel 이 들고 있다.
 * 창 크기·방향이 바뀌어도(Pleos 창 1~2개 전환) 다시 만들지 않는다: 매니페스트 configChanges.
 */
class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { AppRoot(vm) }
    }
}
