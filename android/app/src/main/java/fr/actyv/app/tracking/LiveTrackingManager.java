package fr.actyv.app.tracking;

import android.content.Context;
import android.content.SharedPreferences;
import android.location.LocationManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import android.content.pm.PackageManager;
import android.Manifest;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public final class LiveTrackingManager {
    public static final String PREFS_NAME = "actyv_live_tracking";
    public static final String TRACKING_DIR_NAME = "live-tracking";

    public static final String STATUS_IDLE = "idle";
    public static final String STATUS_RUNNING = "running";
    public static final String STATUS_PAUSED = "paused";
    public static final String STATUS_STOPPED = "stopped";

    private static final String KEY_SESSION_ID = "session_id";
    private static final String KEY_SPORT = "sport";
    private static final String KEY_STATUS = "status";
    private static final String KEY_STARTED_AT_MS = "started_at_ms";
    private static final String KEY_PAUSED_AT_MS = "paused_at_ms";
    private static final String KEY_ACCUMULATED_PAUSED_MS = "accumulated_paused_ms";
    private static final String KEY_LAST_SEQUENCE = "last_sequence";
    private static final String KEY_POINTS_RECORDED = "points_recorded";

    private static final Object FILE_LOCK = new Object();

    private LiveTrackingManager() {}

    public static SharedPreferences getPrefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static void beginSession(
        Context context,
        String sessionId,
        String sport,
        long startedAtMs,
        long accumulatedPausedMs
    ) {
        deleteSessionFile(context, sessionId);

        getPrefs(context)
            .edit()
            .putString(KEY_SESSION_ID, sessionId)
            .putString(KEY_SPORT, sport)
            .putString(KEY_STATUS, STATUS_RUNNING)
            .putLong(KEY_STARTED_AT_MS, startedAtMs)
            .putLong(KEY_PAUSED_AT_MS, 0L)
            .putLong(KEY_ACCUMULATED_PAUSED_MS, Math.max(0L, accumulatedPausedMs))
            .putLong(KEY_LAST_SEQUENCE, 0L)
            .putInt(KEY_POINTS_RECORDED, 0)
            .apply();
    }

    public static void markPaused(Context context, long pausedAtMs, long accumulatedPausedMs) {
        getPrefs(context)
            .edit()
            .putString(KEY_STATUS, STATUS_PAUSED)
            .putLong(KEY_PAUSED_AT_MS, Math.max(0L, pausedAtMs))
            .putLong(KEY_ACCUMULATED_PAUSED_MS, Math.max(0L, accumulatedPausedMs))
            .apply();
    }

    public static void markRunning(Context context, long accumulatedPausedMs) {
        getPrefs(context)
            .edit()
            .putString(KEY_STATUS, STATUS_RUNNING)
            .putLong(KEY_PAUSED_AT_MS, 0L)
            .putLong(KEY_ACCUMULATED_PAUSED_MS, Math.max(0L, accumulatedPausedMs))
            .apply();
    }

    public static void markStopped(Context context) {
        getPrefs(context)
            .edit()
            .putString(KEY_STATUS, STATUS_STOPPED)
            .apply();
    }

    public static void clearSession(Context context, String sessionId) {
        if (sessionId != null && !sessionId.isEmpty()) {
            deleteSessionFile(context, sessionId);
        }

        getPrefs(context)
            .edit()
            .remove(KEY_SESSION_ID)
            .remove(KEY_SPORT)
            .remove(KEY_STATUS)
            .remove(KEY_STARTED_AT_MS)
            .remove(KEY_PAUSED_AT_MS)
            .remove(KEY_ACCUMULATED_PAUSED_MS)
            .remove(KEY_LAST_SEQUENCE)
            .remove(KEY_POINTS_RECORDED)
            .apply();
    }

    public static String getSessionId(Context context) {
        return getPrefs(context).getString(KEY_SESSION_ID, null);
    }

    public static String getSport(Context context) {
        return getPrefs(context).getString(KEY_SPORT, null);
    }

    public static String getStatus(Context context) {
        return getPrefs(context).getString(KEY_STATUS, STATUS_IDLE);
    }

    public static long getStartedAtMs(Context context) {
        return getPrefs(context).getLong(KEY_STARTED_AT_MS, 0L);
    }

    public static long getPausedAtMs(Context context) {
        return getPrefs(context).getLong(KEY_PAUSED_AT_MS, 0L);
    }

    public static long getAccumulatedPausedMs(Context context) {
        return getPrefs(context).getLong(KEY_ACCUMULATED_PAUSED_MS, 0L);
    }

    public static int getLastSequence(Context context) {
        return (int) getPrefs(context).getLong(KEY_LAST_SEQUENCE, 0L);
    }

    public static int getPointsRecorded(Context context) {
        return getPrefs(context).getInt(KEY_POINTS_RECORDED, 0);
    }

    public static int getNextSequence(Context context) {
        SharedPreferences prefs = getPrefs(context);
        int nextSequence = (int) prefs.getLong(KEY_LAST_SEQUENCE, 0L) + 1;
        prefs.edit().putLong(KEY_LAST_SEQUENCE, nextSequence).apply();
        return nextSequence;
    }

    public static void incrementPointsRecorded(Context context) {
        SharedPreferences prefs = getPrefs(context);
        int nextCount = prefs.getInt(KEY_POINTS_RECORDED, 0) + 1;
        prefs.edit().putInt(KEY_POINTS_RECORDED, nextCount).apply();
    }

    public static void appendPoint(Context context, String sessionId, JSObject point) throws IOException {
        if (sessionId == null || sessionId.isEmpty()) {
            return;
        }

        File sessionFile = getSessionFile(context, sessionId);
        File parentDir = sessionFile.getParentFile();
        if (parentDir != null && !parentDir.exists()) {
            parentDir.mkdirs();
        }

        synchronized (FILE_LOCK) {
            try (FileOutputStream outputStream = new FileOutputStream(sessionFile, true)) {
                outputStream.write(point.toString().getBytes(StandardCharsets.UTF_8));
                outputStream.write('\n');
                outputStream.flush();
            }
        }

        incrementPointsRecorded(context);
    }

    public static JSArray readPointsAfter(Context context, String sessionId, int afterSequence) {
        JSArray result = new JSArray();
        if (sessionId == null || sessionId.isEmpty()) {
            return result;
        }

        File sessionFile = getSessionFile(context, sessionId);
        if (!sessionFile.exists()) {
            return result;
        }

        synchronized (FILE_LOCK) {
            try (BufferedReader reader = new BufferedReader(new FileReader(sessionFile, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.trim().isEmpty()) {
                        continue;
                    }

                    JSONObject object = new JSONObject(line);
                    int sequence = object.optInt("sequence", 0);
                    if (sequence <= afterSequence) {
                        continue;
                    }

                    result.put(new JSObject(object.toString()));
                }
            } catch (Exception ignored) {
            }
        }

        return result;
    }

    public static JSObject buildStatus(
        Context context,
        boolean serviceRunning,
        String permissionStatus,
        String notificationPermissionStatus,
        String message
    ) {
        JSObject result = new JSObject();
        String sessionId = getSessionId(context);
        String sport = getSport(context);
        String trackingStatus = getStatus(context);

        result.put("available", true);
        result.put("platform", "android");
        result.put("trackingStatus", serviceRunning ? trackingStatus : STATUS_IDLE);
        result.put("permissionStatus", permissionStatus);
        result.put("notificationPermissionStatus", notificationPermissionStatus);
        result.put("gpsEnabled", isLocationEnabled(context));
        result.put("serviceRunning", serviceRunning);
        result.put("sessionId", sessionId);
        result.put("sport", sport);
        result.put("startedAtMs", getStartedAtMs(context) > 0 ? getStartedAtMs(context) : null);
        result.put("pausedAtMs", getPausedAtMs(context) > 0 ? getPausedAtMs(context) : null);
        result.put("accumulatedPausedMs", getAccumulatedPausedMs(context));
        result.put("lastSequence", getLastSequence(context));
        result.put("pointsRecorded", getPointsRecorded(context));
        result.put("message", message);
        return result;
    }

    public static boolean isLocationEnabled(Context context) {
        LocationManager locationManager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        return locationManager != null && locationManager.isLocationEnabled();
    }

    public static String getLocationPermissionStatus(Context context) {
        boolean fineGranted =
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean coarseGranted =
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;

        if (fineGranted) {
            return "granted";
        }

        if (coarseGranted) {
            return "limited";
        }

        return "denied";
    }

    public static String getNotificationPermissionStatus(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return "granted";
        }

        boolean granted =
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
        return granted ? "granted" : "denied";
    }

    private static File getSessionFile(Context context, String sessionId) {
        File trackingDir = new File(context.getFilesDir(), TRACKING_DIR_NAME);
        return new File(trackingDir, sessionId + ".ndjson");
    }

    private static void deleteSessionFile(Context context, String sessionId) {
        File sessionFile = getSessionFile(context, sessionId);
        if (sessionFile.exists()) {
            sessionFile.delete();
        }
    }
}
