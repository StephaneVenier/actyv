package fr.actyv.app.tracking;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "LiveTracking",
    permissions = {
        @Permission(
            alias = "location",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            }
        ),
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class LiveTrackingPlugin extends Plugin {
    private static final String TAG = "LiveTrackingPlugin";

    private BroadcastReceiver trackingReceiver;
    private boolean receiverRegistered = false;
    private PluginCall pendingStopCall;
    private PluginCall pendingStartCall;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private String activeOwner;
    private int accountGeneration;

    @PluginMethod
    public void setActiveOwner(PluginCall call) {
        accountGeneration++;
        String nextOwner = call.getString("ownerUserId");
        if (nextOwner == null || !nextOwner.equals(LiveTrackingManager.getOwner(getContext()))) {
            activeOwner = null;
            getContext().stopService(new Intent(getContext(), LiveTrackingService.class));
        }
        waitForAccountTransition(call, nextOwner, false, System.currentTimeMillis(), accountGeneration);
    }

    @PluginMethod
    public void purgeOwner(PluginCall call) {
        String owner = call.getString("ownerUserId");
        if (owner == null || !owner.equals(activeOwner)) { call.reject("LIVE_OWNER_REQUIRED"); return; }
        getContext().stopService(new Intent(getContext(), LiveTrackingService.class));
        waitForAccountTransition(call, owner, true, System.currentTimeMillis(), ++accountGeneration);
    }

    private void waitForAccountTransition(PluginCall call, String nextOwner, boolean purge, long started, int generation) {
        mainHandler.postDelayed(() -> {
            if (generation != accountGeneration) { call.reject("LIVE_ACCOUNT_TRANSITION_REPLACED"); return; }
            boolean changing = nextOwner == null || !nextOwner.equals(LiveTrackingManager.getOwner(getContext()));
            if ((changing || purge) && LiveTrackingService.isServiceRunning()) {
                if (System.currentTimeMillis() - started > 15000) { call.reject("LIVE_ACCOUNT_STOP_TIMEOUT"); return; }
                waitForAccountTransition(call, nextOwner, purge, started, generation); return;
            }
            if (purge) {
                // Legacy orphan journals have no trustworthy owner; delete only GPS journals.
                java.io.File directory = new java.io.File(getContext().getFilesDir(), LiveTrackingManager.TRACKING_DIR_NAME);
                java.io.File[] traces = directory.listFiles((dir, name) -> name.endsWith(".ndjson"));
                if (directory.exists() && traces == null) { call.reject("LIVE_PURGE_FAILED"); return; }
                if (traces != null) for (java.io.File trace : traces) {
                    if (!trace.isFile() || !trace.delete()) { call.reject("LIVE_PURGE_FAILED"); return; }
                }
                LiveTrackingManager.clearSession(getContext(), LiveTrackingManager.getSessionId(getContext()));
                if (!getContext().getSharedPreferences(LiveTrackingManager.PREFS_NAME, Context.MODE_PRIVATE).edit().clear().commit()) {
                    call.reject("LIVE_PURGE_FAILED"); return;
                }
            }
            activeOwner = purge ? null : nextOwner;
            call.resolve();
        }, 50);
    }

    @Override
    public void load() {
        super.load();
        registerTrackingReceiver();
    }

    @Override
    protected void handleOnDestroy() {
        unregisterTrackingReceiver();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        call.resolve(buildStatus("Application Android détectée."));
    }

    @PluginMethod
    public void getTrackingStatus(PluginCall call) {
        call.resolve(buildStatus(null));
    }

    @Override
    @PluginMethod
    public void checkPermissions(PluginCall call) {
        call.resolve(buildStatus(null));
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (getLocationPermissionStatus().equals("granted") || getLocationPermissionStatus().equals("limited")) {
            maybeRequestNotificationPermission(call);
            return;
        }

        requestPermissionForAlias("location", call, "onLocationPermissionResult");
    }

    @PermissionCallback
    private void onLocationPermissionResult(PluginCall call) {
        if (getLocationPermissionStatus().equals("denied")) {
            call.resolve(buildStatus("Autorise la localisation pour démarrer le Live."));
            return;
        }

        maybeRequestNotificationPermission(call);
    }

    @PermissionCallback
    private void onNotificationPermissionResult(PluginCall call) {
        call.resolve(buildStatus(null));
    }

    @PluginMethod
    public void startTracking(PluginCall call) {
        String sessionId = call.getString(LiveTrackingService.EXTRA_SESSION_ID);
        String sport = call.getString(LiveTrackingService.EXTRA_SPORT);
        Long startedAtMs = call.getLong(LiveTrackingService.EXTRA_STARTED_AT_MS);
        Long accumulatedPausedMs = call.getLong(LiveTrackingService.EXTRA_ACCUMULATED_PAUSED_MS, 0L);
        String owner = call.getString("ownerUserId");
        if (owner == null || !owner.equals(activeOwner) || LiveTrackingManager.getSessionId(getContext()) != null) {
            call.reject("LIVE_SESSION_UNRESOLVED_OR_OWNER_MISSING");
            return;
        }

        if (sessionId == null || sessionId.isEmpty() || sport == null || sport.isEmpty()) {
            call.reject("LIVE_TRACKING_SESSION_INVALID");
            return;
        }

        if (getLocationPermissionStatus().equals("denied")) {
            call.resolve(buildStatus("Autorise la localisation pour démarrer le Live."));
            return;
        }

        if (!LiveTrackingManager.isLocationEnabled(getContext())) {
            call.resolve(buildStatus("Active la localisation de ton téléphone pour démarrer le Live."));
            return;
        }

        Intent serviceIntent = new Intent(getContext(), LiveTrackingService.class);
        serviceIntent.setAction(LiveTrackingService.ACTION_START);
        serviceIntent.putExtra(LiveTrackingService.EXTRA_SESSION_ID, sessionId);
        serviceIntent.putExtra(LiveTrackingService.EXTRA_SPORT, sport);
        serviceIntent.putExtra(LiveTrackingService.EXTRA_OWNER, owner);
        serviceIntent.putExtra(
            LiveTrackingService.EXTRA_STARTED_AT_MS,
            startedAtMs != null ? startedAtMs : System.currentTimeMillis()
        );
        serviceIntent.putExtra(
            LiveTrackingService.EXTRA_ACCUMULATED_PAUSED_MS,
            accumulatedPausedMs != null ? accumulatedPausedMs : 0L
        );

        startAndAcknowledge(call, serviceIntent);
    }

    private void startAndAcknowledge(PluginCall call, Intent intent) {
        mainHandler.post(() -> {
            if (pendingStartCall != null) { call.reject("LIVE_START_PENDING"); return; }
            pendingStartCall = call;
            try { ContextCompat.startForegroundService(getContext(), intent); }
            catch (Exception error) { pendingStartCall = null; call.reject("LIVE_START_FAILED", error); return; }
            mainHandler.postDelayed(() -> {
                if (pendingStartCall == call) { pendingStartCall = null; call.reject("LIVE_START_TIMEOUT"); }
            }, 15000);
        });
    }

    @PluginMethod
    public void getRecoverySession(PluginCall call) {
        if (activeOwner == null || !activeOwner.equals(call.getString("ownerUserId"))) { call.reject("LIVE_OWNER_REQUIRED"); return; }
        try { call.resolve(LiveTrackingManager.recovery(getContext(), call.getString("ownerUserId"), LiveTrackingService.isServiceRunning())); }
        catch (Exception error) { call.reject("LIVE_RECOVERY_CORRUPTED", error); }
    }

    @PluginMethod
    public void recoverTracking(PluginCall call) {
        if (!ensureSession(call)) return;
        if (LiveTrackingManager.STATUS_STOPPED.equals(LiveTrackingManager.getStatus(getContext()))) {
            call.reject("LIVE_SESSION_ALREADY_STOPPED"); return;
        }
        if (LiveTrackingService.isCollecting()) { call.resolve(buildStatus(null)); return; }
        Intent intent = new Intent(getContext(), LiveTrackingService.class);
        intent.setAction(LiveTrackingService.ACTION_RECOVER);
        startAndAcknowledge(call, intent);
    }

    @PluginMethod
    public void pauseTracking(PluginCall call) {
        if (!ensureSession(call)) {
            return;
        }

        if (!LiveTrackingService.isServiceRunning()) {
            call.resolve(buildStatus("Aucun suivi GPS actif à mettre en pause."));
            return;
        }

        Intent serviceIntent = new Intent(getContext(), LiveTrackingService.class);
        serviceIntent.setAction(LiveTrackingService.ACTION_PAUSE);
        serviceIntent.putExtra(
            LiveTrackingService.EXTRA_PAUSED_AT_MS,
            call.getLong(LiveTrackingService.EXTRA_PAUSED_AT_MS, System.currentTimeMillis())
        );
        serviceIntent.putExtra(
            LiveTrackingService.EXTRA_ACCUMULATED_PAUSED_MS,
            call.getLong(LiveTrackingService.EXTRA_ACCUMULATED_PAUSED_MS, 0L)
        );
        getContext().startService(serviceIntent);
        call.resolve(buildStatus("Suivi mis en pause."));
    }

    @PluginMethod
    public void resumeTracking(PluginCall call) {
        if (!ensureSession(call)) {
            return;
        }

        if (!LiveTrackingService.isServiceRunning()) {
            call.resolve(buildStatus("Aucun suivi GPS actif à reprendre."));
            return;
        }

        Intent serviceIntent = new Intent(getContext(), LiveTrackingService.class);
        serviceIntent.setAction(LiveTrackingService.ACTION_RESUME);
        serviceIntent.putExtra("resumedAtMs", call.getLong("resumedAtMs", System.currentTimeMillis()));
        serviceIntent.putExtra(
            LiveTrackingService.EXTRA_ACCUMULATED_PAUSED_MS,
            call.getLong(LiveTrackingService.EXTRA_ACCUMULATED_PAUSED_MS, 0L)
        );
        getContext().startService(serviceIntent);
        call.resolve(buildStatus("Suivi repris."));
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        if (!ensureSession(call)) {
            return;
        }

        if (!LiveTrackingService.isServiceRunning()) {
            LiveTrackingManager.markInterrupted(getContext());
            LiveTrackingManager.markStopped(getContext());
            call.resolve(buildStatus("Le suivi GPS est déjà arrêté."));
            return;
        }

        mainHandler.post(() -> {
            if (pendingStopCall != null) {
                call.reject("LIVE_TRACKING_STOP_PENDING");
                return;
            }
            pendingStopCall = call;
            Intent serviceIntent = new Intent(getContext(), LiveTrackingService.class);
            serviceIntent.setAction(LiveTrackingService.ACTION_STOP);
            try {
                getContext().startService(serviceIntent);
            } catch (Exception error) {
                pendingStopCall = null;
                call.reject("LIVE_TRACKING_STOP_FAILED", error);
                return;
            }
            mainHandler.postDelayed(() -> {
                if (pendingStopCall == call) {
                    pendingStopCall = null;
                    call.reject("LIVE_TRACKING_STOP_TIMEOUT");
                }
            }, 15000);
        });
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        String sessionId = call.getString("sessionId");
        if (!ensureSession(call)) return;
        if (sessionId == null || !sessionId.matches("[A-Za-z0-9-]{1,100}")) {
            call.reject("LIVE_TRACKING_SESSION_INVALID");
            return;
        }
        if (LiveTrackingService.isServiceRunning() && sessionId.equals(LiveTrackingManager.getSessionId(getContext()))) {
            call.reject("LIVE_TRACKING_SESSION_STILL_RUNNING");
            return;
        }
        LiveTrackingManager.clearSession(getContext(), sessionId);
        call.resolve(buildStatus(null));
    }

    @PluginMethod
    public void getPendingPoints(PluginCall call) {
        String sessionId = call.getString("sessionId");
        if (!ensureSession(call)) return;
        Integer afterSequence = call.getInt("afterSequence", 0);

        if (sessionId == null || !sessionId.matches("[A-Za-z0-9-]{1,100}")) {
            call.reject("LIVE_TRACKING_SESSION_INVALID");
            return;
        }

        try {
        call.resolve(LiveTrackingManager.pending(getContext(), sessionId, call.getString("ownerUserId"),
            afterSequence != null ? afterSequence : 0, LiveTrackingService.isServiceRunning()));
        } catch (Exception error) { call.reject("LIVE_TRACE_CORRUPTED", error); }
    }

    private boolean ensureSession(PluginCall call) {
        String sessionId = call.getString("sessionId");
        String owner = call.getString("ownerUserId");
        if (sessionId == null || !sessionId.equals(LiveTrackingManager.getSessionId(getContext())) ||
            owner == null || !owner.equals(activeOwner) || !owner.equals(LiveTrackingManager.getOwner(getContext()))) {
            call.reject("LIVE_TRACKING_SESSION_INVALID");
            return false;
        }
        return true;
    }

    private void maybeRequestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(buildStatus(null));
            return;
        }

        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(buildStatus(null));
            return;
        }

        requestPermissionForAlias("notifications", call, "onNotificationPermissionResult");
    }

    private String getLocationPermissionStatus() {
        return LiveTrackingManager.getLocationPermissionStatus(getContext());
    }

    private String getNotificationPermissionStatus() {
        return LiveTrackingManager.getNotificationPermissionStatus(getContext());
    }

    private JSObject buildStatus(String message) {
        if (activeOwner == null || !activeOwner.equals(LiveTrackingManager.getOwner(getContext()))) {
            JSObject empty = new JSObject();
            empty.put("available", true); empty.put("trackingStatus", "idle");
            empty.put("permissionStatus", getLocationPermissionStatus());
            empty.put("notificationPermissionStatus", getNotificationPermissionStatus());
            empty.put("gpsEnabled", LiveTrackingManager.isLocationEnabled(getContext()));
            empty.put("finalizationVersion", 1); empty.put("recoveryVersion", 1);
            return empty;
        }
        return LiveTrackingManager.buildStatus(
            getContext(),
            LiveTrackingService.isServiceRunning(),
            getLocationPermissionStatus(),
            getNotificationPermissionStatus(),
            message
        );
    }

    private void registerTrackingReceiver() {
        if (receiverRegistered) {
            return;
        }

        trackingReceiver =
            new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (activeOwner == null || !activeOwner.equals(LiveTrackingManager.getOwner(context))) return;
                    String payload = intent.getStringExtra("payload");
                    if (payload == null || payload.isEmpty()) {
                        return;
                    }

                    try {
                        JSObject data = new JSObject(payload);
                        String action = intent.getAction();
                        if (LiveTrackingService.BROADCAST_LOCATION_UPDATE.equals(action)) {
                            notifyListeners("locationUpdate", data, false);
                        } else if (LiveTrackingService.BROADCAST_STATUS.equals(action)) {
                            if (pendingStartCall != null && LiveTrackingService.isServiceRunning() &&
                                !LiveTrackingManager.STATUS_STOPPED.equals(data.getString("trackingStatus"))) {
                                PluginCall started = pendingStartCall; pendingStartCall = null; started.resolve(data);
                            }
                            if (LiveTrackingManager.STATUS_STOPPED.equals(data.getString("trackingStatus")) && pendingStopCall != null) {
                                PluginCall stoppedCall = pendingStopCall;
                                pendingStopCall = null;
                                stoppedCall.resolve(data);
                            }
                            notifyListeners("trackingStatus", data, false);
                        } else if (LiveTrackingService.BROADCAST_ERROR.equals(action)) {
                            if (pendingStartCall != null) { PluginCall failed = pendingStartCall; pendingStartCall = null;
                                failed.reject(data.getString("message")); }
                            notifyListeners("trackingError", data, false);
                        }
                    } catch (Exception error) {
                        Log.e(TAG, "Failed to relay live tracking broadcast", error);
                    }
                }
            };

        IntentFilter intentFilter = new IntentFilter();
        intentFilter.addAction(LiveTrackingService.BROADCAST_LOCATION_UPDATE);
        intentFilter.addAction(LiveTrackingService.BROADCAST_STATUS);
        intentFilter.addAction(LiveTrackingService.BROADCAST_ERROR);

        ContextCompat.registerReceiver(
            getContext(),
            trackingReceiver,
            intentFilter,
            ContextCompat.RECEIVER_NOT_EXPORTED
        );

        receiverRegistered = true;
    }

    private void unregisterTrackingReceiver() {
        if (!receiverRegistered || trackingReceiver == null) {
            return;
        }

        try {
            getContext().unregisterReceiver(trackingReceiver);
        } catch (Exception error) {
            Log.w(TAG, "Failed to unregister tracking receiver", error);
        } finally {
            receiverRegistered = false;
            trackingReceiver = null;
        }
    }
}
