package fr.actyv.app.health;

import android.util.Log;
import androidx.annotation.NonNull;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HealthConnect")
public class HealthConnectPlugin extends Plugin {
    private static final String TAG = "HealthConnect";

    @PluginMethod
    public void isAvailable(PluginCall call) {
        call.resolve(createAndroidDetectedResult("Application Android detectee. Plugin Health Connect branche."));
    }

    @PluginMethod
    public void isHealthConnectAvailable(PluginCall call) {
        isAvailable(call);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        JSObject result = createAndroidDetectedResult("Permissions Health Connect non implementees dans ce stub.");
        result.put("granted", false);
        result.put("status", "health_connect_available");
        call.resolve(result);
        Log.i(TAG, "requestPermissions stub appele");
    }

    @PluginMethod
    public void readTodaySteps(PluginCall call) {
        JSObject result = createAndroidDetectedResult("Health Connect steps read not implemented yet.");
        result.put("stepsCount", 0);
        result.put("status", "health_connect_available");
        call.resolve(result);
        Log.i(TAG, "readTodaySteps stub appele");
    }

    @PluginMethod
    public void requestHealthPermissions(PluginCall call) {
        requestPermissions(call);
    }

    @PluginMethod
    public void readTodayHealthData(PluginCall call) {
        readTodaySteps(call);
    }

    @PluginMethod
    public void syncTodayHealthData(PluginCall call) {
        syncTodaySteps(call);
    }

    @PluginMethod
    public void syncTodaySteps(PluginCall call) {
        JSObject result = createAndroidDetectedResult("Health Connect steps read not implemented yet.");
        result.put("stepsCount", 0);
        result.put("status", "health_connect_available");
        call.resolve(result);
        Log.i(TAG, "syncTodaySteps stub appele");
    }

    @NonNull
    private JSObject createAndroidDetectedResult(String message) {
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("granted", false);
        result.put("status", "android_detected");
        result.put("message", message);
        result.put("stepsCount", 0);
        result.put("syncedAt", null);
        return result;
    }
}
