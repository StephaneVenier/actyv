package fr.actyv.app;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import fr.actyv.app.health.HealthConnectPlugin;
import fr.actyv.app.tracking.LiveTrackingPlugin;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HealthConnectPlugin.class);
        registerPlugin(LiveTrackingPlugin.class);
        Log.i(TAG, "HealthConnectPlugin registered");
        Log.i(TAG, "LiveTrackingPlugin registered");
        super.onCreate(savedInstanceState);
    }
}
