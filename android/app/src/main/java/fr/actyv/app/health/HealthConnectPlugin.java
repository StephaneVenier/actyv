package fr.actyv.app.health;

import android.content.Intent;
import android.util.Log;
import androidx.activity.ComponentActivity;
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
import com.getcapacitor.annotation.CapacitorPlugin;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import kotlin.coroutines.Continuation;
import kotlin.coroutines.EmptyCoroutineContext;
import kotlin.jvm.JvmClassMappingKt;
import kotlin.jvm.functions.Function2;
import kotlinx.coroutines.BuildersKt;
import kotlinx.coroutines.CoroutineScope;
import androidx.activity.result.ActivityResultLauncher;

@CapacitorPlugin(name = "HealthConnect")
public class HealthConnectPlugin extends Plugin {
    private static final String TAG = "HealthConnect";
    private static final String HEALTH_CONNECT_PACKAGE = "com.google.android.apps.healthdata";
    private static final String READ_STEPS_PERMISSION =
        HealthPermission.getReadPermission(JvmClassMappingKt.getKotlinClass(StepsRecord.class));
    private static final String DENIED_MESSAGE =
        "Permission refusee ou non accordee. Ouvre Health Connect pour autoriser Actyv a lire les pas.";

    private final ActivityResultContract<Set<String>, Set<String>> permissionRequestContract =
        PermissionController.createRequestPermissionResultContract();
    private ActivityResultLauncher<Set<String>> permissionLauncher;
    private PluginCall pendingPermissionCall;
    private final AtomicBoolean launcherRegistered = new AtomicBoolean(false);

    @Override
    public void load() {
        super.load();
        Log.i(TAG, "HealthConnectPlugin loaded");
        registerPermissionLauncher();
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
        Log.i(TAG, "requestPermissions called");
        Log.i(TAG, "permissions declared: READ_STEPS=" + READ_STEPS_PERMISSION);
        Log.i(TAG, "Health Connect SDK status=" + HealthConnectClient.getSdkStatus(getContext(), HEALTH_CONNECT_PACKAGE));

        if (!isHealthConnectSdkAvailable()) {
            call.resolve(createAndroidDetectedResult("Application Android detectee. Connexion Health Connect a configurer."));
            return;
        }

        registerPermissionLauncher();
        if (permissionLauncher == null) {
            call.resolve(createHealthConnectAvailableResult("Impossible d'ouvrir la demande de permissions Health Connect."));
            return;
        }

        if (pendingPermissionCall != null) {
            Log.w(TAG, "Une demande de permission est deja en cours.");
            pendingPermissionCall.reject("Une demande de permission est deja en cours.");
        }

        pendingPermissionCall = call;
        Log.i(TAG, "permission launcher opened");
        permissionLauncher.launch(Collections.singleton(READ_STEPS_PERMISSION));
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

    @PluginMethod
    public void openHealthConnectSettings(PluginCall call) {
        if (!isHealthConnectSdkAvailable()) {
            call.resolve(createAndroidDetectedResult("Application Android detectee. Connexion Health Connect a configurer."));
            return;
        }

        try {
            Intent intent = new Intent(HealthConnectClient.getHealthConnectSettingsAction());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            Log.i(TAG, "Health Connect settings opened");
            JSObject result = createHealthConnectAvailableResult("Health Connect ouvert.");
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception error) {
            Log.e(TAG, "Impossible d'ouvrir les parametres Health Connect", error);
            call.resolve(createHealthConnectAvailableResult("Impossible d'ouvrir les parametres Health Connect."));
        }
    }

    private void registerPermissionLauncher() {
        if (launcherRegistered.get()) {
            return;
        }

        if (!(getActivity() instanceof ComponentActivity)) {
            Log.w(TAG, "Impossible d'enregistrer le launcher Health Connect: activity indisponible.");
            return;
        }

        ComponentActivity activity = (ComponentActivity) getActivity();
        permissionLauncher = activity.registerForActivityResult(permissionRequestContract, grantedPermissions -> {
            Log.i(TAG, "permission result received");

            boolean granted = grantedPermissions != null && grantedPermissions.contains(READ_STEPS_PERMISSION);
            Log.i(TAG, "permissions granted = " + granted);

            PluginCall call = pendingPermissionCall;
            pendingPermissionCall = null;

            if (call == null) {
                Log.w(TAG, "Aucune call en attente pour le retour Health Connect.");
                return;
            }

            JSObject output = granted
                ? createPermissionsGrantedResult("Permissions accordees.")
                : createHealthConnectAvailableResult(DENIED_MESSAGE);
            output.put("granted", granted);
            call.resolve(output);
        });

        launcherRegistered.set(true);
        Log.i(TAG, "permission launcher registered");
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
            return createHealthConnectAvailableResult(DENIED_MESSAGE);
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
