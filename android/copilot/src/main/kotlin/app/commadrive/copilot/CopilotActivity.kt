package app.commadrive.copilot

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

/** MY CO-PILOT Pleos Connect 차량용 앱(1차 출품작) — 앱 창 하나. 창 크기·방향이 바뀌어도 다시 만들지 않는다(매니페스트 configChanges) */
class CopilotActivity : ComponentActivity() {
    private val vm: CopilotViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // 창이 보이지 않으면 모의 타이머·음성을 멈춘다. 사라진 앱은 종료가 아니다(Pleos 창 정책) — 상태는 ViewModel 이 들고 있다
        lifecycle.addObserver(LifecycleEventObserver { _, e ->
            if (e == Lifecycle.Event.ON_START) vm.setForeground(true)
            if (e == Lifecycle.Event.ON_STOP) vm.setForeground(false)
        })
        setContent { CopilotRoot(vm) }
    }
}
