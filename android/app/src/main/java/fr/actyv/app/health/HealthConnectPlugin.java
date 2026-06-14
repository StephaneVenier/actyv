package fr.actyv.app.health;

import android.content.Intent;
import android.util.Log;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.contract.ActivityResultContract;
import androidx.annotation.NonNull;
import androidx.health.connect.client.HealthConnectClient;
import androidx.health.connect.client.PermissionController;
import androidx.health.connect.client.aggregate.AggregateMetric;
import androidx.health.connect.client.aggregate.AggregationResult;
import androidx.health.connect.client.permission.HealthPermission;
import androidx.health.connect.client.records.StepsRecord;
import androidx.health.connect.client.records.metadata.DataOrigin;
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
import kotlin.coroutines.Continuation;
import kotlin.coroutines.EmptyCoroutineContext;
import kotlin.jvm.JvmClassMappingKt;
import kotlin.jvm.functions.Function2;
import kotlinx.coroutines.BuildersKt;
import kotlinx.coroutines.CoroutineScope;

@CapacitorPlugin(name = "HealthConnect")
public class HealthConnectPlugin extends Plugin {
    private static final String TAG = "HealthConnect";
    private static final String HEALTH_CONNECT_PACKAGE = "com.google.android.apps.healthdata";
    private static final String READ_STEPS_PERMISSION =
        HealthPermission.getReadPermission(JvmClassMappingKt.getKotlinClass(StepsRecord.class));

    private final ActivityResultContract<Set<String>, Set<String>> permissionRequestContract =
        PermissionController.createRequestPermissionResultContract();

    @Override
    public void load() {
        super.load();
        Log.i(TAG, "HealthConnectPlugin loaded");
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        call.resolve(createAvailabilityResult());
    }

    @PluginMethod
    public void isHealthConnectAvailable(PluginCall call) {
        isAvailable(call);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (!isHealthConnectSdkAvailable()) {
            call.resolve(createAndroidDetectedResult("Application Android detectee. Connexion Health Connect a configurer."));
            return;
        }

        Intent intent = permissionRequestContract.createIntent(getContext(), Collections.singleton(READ_STEPS_PERMISSION));
        startActivityForResult(call, intent, "onPermissionResult");
    }

    @PluginMethod
    public void readTodaySteps(PluginCall call) {
        call.resolve(readTodayStepsResult());
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
        call.resolve(readTodayStepsResult());
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
            granted = grantedPermissions != null && grantedPermissions.contains(READ_STEPS_PERMISSION);
        } catch (Exception error) {
            Log.e(TAG, "Impossible de lire le resultat des permissions Health Connect", error);
        }

        JSObject output = granted
            ? createPermissionsGrantedResult("Permissions accordees.")
            : createHealthConnectAvailableResult("Permissions Health Connect refusees.");
        output.put("granted", granted);

        Log.i(TAG, granted ? "Health permissions granted" : "Permissions Health Connect refusees");
        call.resolve(output);
    }

    @NonNull
    private JSObject createAvailabilityResult() {
        if (!isHealthConnectSdkAvailable()) {
            return createAndroidDetectedResult("Application Android detectee. Connexion Health Connect a configurer.");
        }

        boolean granted = hasReadPermission();
        if (granted) {
            JSObject result = createPermissionsGrantedResult("Health Connect connecte.");
            result.put("stepsCount", readTodayStepsCount());
            result.put("syncedAt", Instant.now().toString());
            return result;
        }

        return createHealthConnectAvailableResult("Health Connect disponible.");
    }

    @NonNull
    private JSObject readTodayStepsResult() {
        if (!isHealthConnectSdkAvailable()) {
            return createAndroidDetectedResult("Application Android detectee. Connexion Health Connect a configurer.");
        }

        if (!hasReadPermission()) {
            return createHealthConnectAvailableResult("Permissions Health Connect manquantes.");
        }

        try {
            long stepsCount = readTodayStepsCount();

            JSObject result = createPermissionsGrantedResult("Health Connect connecte.");
            result.put("stepsCount", stepsCount);
            result.put("syncedAt", Instant.now().toString());

            Log.i(TAG, "Steps read: " + stepsCount);
            return result;
        } catch (Exception error) {
            Log.e(TAG, "Impossible de lire les pas Health Connect", error);
            return createHealthConnectAvailableResult("Impossible de lire les pas Health Connect.");
        }
    }

    private boolean isHealthConnectSdkAvailable() {
        int sdkStatus = HealthConnectClient.getSdkStatus(getContext(), HEALTH_CONNECT_PACKAGE);
        return sdkStatus == HealthConnectClient.SDK_AVAILABLE;
    }

    private boolean hasReadPermission() {
        try {
            Set<String> grantedPermissions = runBlocking(new Function2<CoroutineScope, Continuation<? super Set<String>>, Object>() {
                @Override
                public Object invoke(CoroutineScope scope, Continuation<? super Set<String>> continuation) {
                    return HealthConnectClient.getOrCreate(getContext()).getPermissionController().getGrantedPermissions(continuation);
                }
            });
            return grantedPermissions != null && grantedPermissions.contains(READ_STEPS_PERMISSION);
        } catch (Exception error) {
            Log.w(TAG, "Impossible de verifier les permissions Health Connect", error);
            return false;
        }
    }

    private long readTodayStepsCount() {
        HealthConnectClient client = HealthConnectClient.getOrCreate(getContext());
        ZoneId zoneId = ZoneId.systemDefault();
        Instant startInstant = LocalDate.now(zoneId).atStartOfDay(zoneId).toInstant();
        Instant now = Instant.now();

        Set<AggregateMetric<?>> metrics = new HashSet<>();
        metrics.add(StepsRecord.COUNT_TOTAL);

        AggregateRequest request = new AggregateRequest(
            metrics,
            TimeRangeFilter.between(startInstant, now),
            Collections.<DataOrigin>emptySet()
        );

        AggregationResult aggregationResult = runBlocking(new Function2<CoroutineScope, Continuation<? super AggregationResult>, Object>() {
            @Override
            public Object invoke(CoroutineScope scope, Continuation<? super AggregationResult> continuation) {
                return client.aggregate(request, continuation);
            }
        });

        Long steps = aggregationResult.get(StepsRecord.COUNT_TOTAL);
        return steps == null ? 0L : Math.max(0L, steps);
    }

    private <T> T runBlocking(Function2<CoroutineScope, Continuation<? super T>, Object> block) {
        try {
            @SuppressWarnings("unchecked")
            T result = (T) BuildersKt.runBlocking(EmptyCoroutineContext.INSTANCE, block);
            return result;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Health Connect coroutine interrupted", error);
        }
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

    @NonNull
    private JSObject createPermissionsGrantedResult(String message) {
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("granted", true);
        result.put("status", "permissions_granted");
        result.put("message", message);
        result.put("stepsCount", 0);
        result.put("syncedAt", null);
        return result;
    }
}
