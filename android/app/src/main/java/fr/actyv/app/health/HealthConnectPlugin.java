package fr.actyv.app.health;

import android.content.Intent;
import android.util.Log;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.contract.ActivityResultContract;
import androidx.annotation.NonNull;
import androidx.health.connect.client.HealthConnectClient;
import androidx.health.connect.client.aggregate.AggregateMetric;
import androidx.health.connect.client.aggregate.AggregationResult;
import androidx.health.connect.client.permission.HealthPermission;
import androidx.health.connect.client.permission.PermissionController;
import androidx.health.connect.client.records.StepsRecord;
import androidx.health.connect.client.request.AggregateRequest;
import androidx.health.connect.client.time.TimeRangeFilter;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(name = "HealthConnect")
public class HealthConnectPlugin extends Plugin {
    private static final String TAG = "HealthConnect";
    private static final String HEALTH_CONNECT_PACKAGE = "com.google.android.apps.healthdata";
    private static final Set<String> REQUIRED_PERMISSIONS =
        Collections.singleton(HealthPermission.getReadPermission(StepsRecord.class));

    @SuppressWarnings("rawtypes")
    private final ActivityResultContract permissionRequestContract = PermissionController.createRequestPermissionResultContract();

    @PluginMethod
    public void isHealthConnectAvailable(PluginCall call) {
        JSObject result = new JSObject();
        int sdkStatus = HealthConnectClient.getSdkStatus(getContext(), HEALTH_CONNECT_PACKAGE);
        boolean available = sdkStatus == HealthConnectClient.SDK_AVAILABLE;
        String status = available ? "health_connect_available" : "android_detected";

        result.put("available", available);
        result.put("granted", false);
        result.put("status", status);
        result.put("stepsCount", 0);
        result.put("syncedAt", null);
        result.put(
            "message",
            available
                ? "Health Connect disponible."
                : "Application Android detectee. Connexion Health Connect a configurer."
        );

        Log.i(TAG, available ? "Health Connect disponible" : "Application Android detectee");
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        int sdkStatus = HealthConnectClient.getSdkStatus(getContext(), HEALTH_CONNECT_PACKAGE);
        if (sdkStatus != HealthConnectClient.SDK_AVAILABLE) {
            call.resolve(createAndroidDetectedResult("Application Android detectee. Connexion Health Connect a configurer."));
            return;
        }

        Intent intent = permissionRequestContract.createIntent(getContext(), REQUIRED_PERMISSIONS);
        startActivityForResult(call, intent, "onPermissionResult");
    }

    @PluginMethod
    public void readTodaySteps(PluginCall call) {
        call.resolve(readTodayStepsResult());
    }

    @PluginMethod
    public void syncTodaySteps(PluginCall call) {
        JSObject result = readTodayStepsResult();
        if (result.optBoolean("available", false) && result.optBoolean("granted", false)) {
            Log.i(TAG, "Synchronisation reussie");
        }
        call.resolve(result);
    }

    @ActivityCallback
    private void onPermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        boolean granted = false;
        try {
            @SuppressWarnings("unchecked")
            Set<String> grantedPermissions = (Set<String>) permissionRequestContract.parseResult(result.getResultCode(), result.getData());
            granted = grantedPermissions != null && grantedPermissions.containsAll(REQUIRED_PERMISSIONS);
        } catch (Exception error) {
            Log.e(TAG, "Impossible de lire le resultat des permissions Health Connect", error);
        }

        JSObject output = new JSObject();
        output.put("available", true);
        output.put("granted", granted);
        output.put("status", granted ? "permissions_granted" : "health_connect_available");
        output.put("stepsCount", 0);
        output.put("syncedAt", null);
        output.put(
            "message",
            granted ? "Permissions accordees." : "Permissions Health Connect refusees."
        );

        Log.i(TAG, granted ? "Permissions accordees" : "Permissions refusees");
        call.resolve(output);
    }

    @NonNull
    private JSObject createUnavailableResult(String message) {
        JSObject result = new JSObject();
        result.put("available", false);
        result.put("granted", false);
        result.put("status", "web_unavailable");
        result.put("message", message);
        result.put("stepsCount", 0);
        result.put("syncedAt", null);
        return result;
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

    @NonNull
    private JSObject readTodayStepsResult() {
        int sdkStatus = HealthConnectClient.getSdkStatus(getContext(), HEALTH_CONNECT_PACKAGE);
        if (sdkStatus != HealthConnectClient.SDK_AVAILABLE) {
            return createAndroidDetectedResult("Application Android detectee. Connexion Health Connect a configurer.");
        }

        try {
            HealthConnectClient client = HealthConnectClient.getOrCreate(getContext());
            ZoneId zoneId = ZoneId.systemDefault();
            Instant startInstant = LocalDate.now(zoneId).atStartOfDay(zoneId).toInstant();
            Instant now = Instant.now();

            Set<AggregateMetric<?>> metrics = new HashSet<>();
            metrics.add(StepsRecord.COUNT_TOTAL);

            AggregateRequest request = new AggregateRequest(metrics, TimeRangeFilter.between(startInstant, now), Collections.emptySet());
            AggregationResult aggregationResult = client.aggregate(request);
            Long steps = aggregationResult.get(StepsRecord.COUNT_TOTAL);
            long stepsCount = steps == null ? 0L : Math.max(0L, steps);

            JSObject result = new JSObject();
            result.put("available", true);
            result.put("granted", true);
            result.put("status", "permissions_granted");
            result.put("message", "Pas recuperes.");
            result.put("stepsCount", stepsCount);
            result.put("syncedAt", Instant.now().toString());

            Log.i(TAG, "Pas recuperes: " + stepsCount);
            return result;
        } catch (SecurityException error) {
            Log.w(TAG, "Permissions Health Connect manquantes", error);
            return createHealthConnectAvailableResult("Permissions Health Connect manquantes.");
        } catch (Exception error) {
            Log.e(TAG, "Impossible de lire les pas Health Connect", error);
            JSObject result = new JSObject();
            result.put("available", true);
            result.put("granted", false);
            result.put("status", "health_connect_available");
            result.put("message", "Impossible de lire les pas Health Connect.");
            result.put("stepsCount", 0);
            result.put("syncedAt", null);
            return result;
        }
    }

    @NonNull
    private JSObject createHealthConnectAvailableResult(String message) {
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("granted", false);
        result.put("status", "health_connect_available");
        result.put("message", message);
        result.put("stepsCount", 0);
        result.put("syncedAt", null);
        return result;
    }
}
