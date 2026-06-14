package fr.actyv.app;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import fr.actyv.app.health.HealthConnectPlugin;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HealthConnectPlugin.class);
        Log.i(TAG, "HealthConnectPlugin registered");
        super.onCreate(savedInstanceState);
    }
}
