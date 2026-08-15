package fr.actyv.app.tracking;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
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
        serviceIntent.putExtra(
            LiveTrackingService.EXTRA_STARTED_AT_MS,
            startedAtMs != null ? startedAtMs : System.currentTimeMillis()
        );
        serviceIntent.putExtra(
            LiveTrackingService.EXTRA_ACCUMULATED_PAUSED_MS,
            accumulatedPausedMs != null ? accumulatedPausedMs : 0L
        );

        ContextCompat.startForegroundService(getContext(), serviceIntent);
        call.resolve(buildStatus("Suivi GPS actif."));
    }

    @PluginMethod
    public void pauseTracking(PluginCall call) {
        if (!ensureSession(call)) {
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
        ContextCompat.startForegroundService(getContext(), serviceIntent);
        call.resolve(buildStatus("Suivi mis en pause."));
    }

    @PluginMethod
    public void resumeTracking(PluginCall call) {
        if (!ensureSession(call)) {
            return;
        }

        Intent serviceIntent = new Intent(getContext(), LiveTrackingService.class);
        serviceIntent.setAction(LiveTrackingService.ACTION_RESUME);
        serviceIntent.putExtra(
            LiveTrackingService.EXTRA_ACCUMULATED_PAUSED_MS,
            call.getLong(LiveTrackingService.EXTRA_ACCUMULATED_PAUSED_MS, 0L)
        );
        ContextCompat.startForegroundService(getContext(), serviceIntent);
        call.resolve(buildStatus("Suivi repris."));
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        if (!ensureSession(call)) {
            return;
        }

        Intent serviceIntent = new Intent(getContext(), LiveTrackingService.class);
        serviceIntent.setAction(LiveTrackingService.ACTION_STOP);
        ContextCompat.startForegroundService(getContext(), serviceIntent);
        call.resolve(buildStatus("Suivi GPS arrêté."));
    }

    @PluginMethod
    public void getPendingPoints(PluginCall call) {
        String sessionId = call.getString("sessionId");
        Integer afterSequence = call.getInt("afterSequence", 0);

        if (sessionId == null || sessionId.isEmpty()) {
            call.reject("LIVE_TRACKING_SESSION_INVALID");
            return;
        }

        JSArray points = LiveTrackingManager.readPointsAfter(
            getContext(),
            sessionId,
            afterSequence != null ? afterSequence : 0
        );

        JSObject result = new JSObject();
        result.put("sessionId", sessionId);
        result.put("lastSequence", LiveTrackingManager.getLastSequence(getContext()));
        result.put("points", points);
        call.resolve(result);
    }

    private boolean ensureSession(PluginCall call) {
        String sessionId = call.getString("sessionId");
        if (sessionId == null || sessionId.isEmpty()) {
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
                    String payload = intent.getStringExtra("payload");
                    if (payload == null || payload.isEmpty()) {
                        return;
                    }

                    try {
                        JSObject data = new JSObject(payload);
                        String action = intent.getAction();
                        if (LiveTrackingService.BROADCAST_LOCATION_UPDATE.equals(action)) {
                            notifyListeners("locationUpdate", data, true);
                        } else if (LiveTrackingService.BROADCAST_STATUS.equals(action)) {
                            notifyListeners("trackingStatus", data, true);
                        } else if (LiveTrackingService.BROADCAST_ERROR.equals(action)) {
                            notifyListeners("trackingError", data, true);
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

