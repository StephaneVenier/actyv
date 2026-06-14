package fr.actyv.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import fr.actyv.app.health.HealthConnectPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(HealthConnectPlugin.class);
    }
}
