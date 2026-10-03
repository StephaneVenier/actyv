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
import java.io.File;
import java.io.IOException;
import org.json.JSONObject;
import org.json.JSONArray;

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
    private static final String KEY_STOPPED_AT_MS = "stopped_at_ms";
    private static final String KEY_OWNER = "owner_user_id";
    private static final String KEY_EVENTS = "events";
    private static final String KEY_COLLECTION_ACTIVE = "collection_active";
    private static final String KEY_LAST_COLLECTION_AT = "last_collection_at_ms";
    private static final String KEY_TRACE_WARNING = "trace_warning";
    private static String scannedSessionId;
    private static LiveTrackingFile.Scan cachedScan;

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
        long accumulatedPausedMs,
        String ownerUserId
    ) {
        if (getSessionId(context) != null) throw new IllegalStateException("LIVE_SESSION_UNRESOLVED");
        if (ownerUserId == null || ownerUserId.isEmpty()) throw new IllegalStateException("LIVE_OWNER_REQUIRED");
        if (getSessionFile(context, sessionId).exists()) throw new IllegalStateException("LIVE_TRACE_ALREADY_EXISTS");

        getPrefs(context)
            .edit()
            .putString(KEY_SESSION_ID, sessionId)
            .putString(KEY_SPORT, sport)
            .putString(KEY_OWNER, ownerUserId)
            .putString(KEY_EVENTS, new JSONArray().put(event("START", startedAtMs, false)).toString())
            .putBoolean(KEY_COLLECTION_ACTIVE, false)
            .putBoolean(KEY_TRACE_WARNING, false)
            .putLong(KEY_LAST_COLLECTION_AT, startedAtMs)
            .putString(KEY_STATUS, STATUS_RUNNING)
            .putLong(KEY_STARTED_AT_MS, startedAtMs)
            .putLong(KEY_PAUSED_AT_MS, 0L)
            .putLong(KEY_ACCUMULATED_PAUSED_MS, Math.max(0L, accumulatedPausedMs))
            .putLong(KEY_LAST_SEQUENCE, 0L)
            .putInt(KEY_POINTS_RECORDED, 0)
            .remove(KEY_STOPPED_AT_MS)
            .commit();
    }

    public static void markPaused(Context context, long pausedAtMs, long accumulatedPausedMs) {
        getPrefs(context)
            .edit()
            .putString(KEY_STATUS, STATUS_PAUSED)
            .putLong(KEY_PAUSED_AT_MS, Math.max(0L, pausedAtMs))
            .putLong(KEY_ACCUMULATED_PAUSED_MS, Math.max(0L, accumulatedPausedMs))
            .putString(KEY_EVENTS, eventsWith(context, "PAUSE", pausedAtMs, false).toString())
            .commit();
    }

    public static void markRunning(Context context, long accumulatedPausedMs, long resumedAtMs) {
        getPrefs(context)
            .edit()
            .putString(KEY_STATUS, STATUS_RUNNING)
            .putLong(KEY_PAUSED_AT_MS, 0L)
            .putLong(KEY_ACCUMULATED_PAUSED_MS, Math.max(0L, accumulatedPausedMs))
            .putString(KEY_EVENTS, eventsWith(context, "RESUME", resumedAtMs, false).toString())
            .commit();
    }

    public static void markStopped(Context context) {
        if (STATUS_STOPPED.equals(getStatus(context))) return;
        getPrefs(context)
            .edit()
            .putString(KEY_STATUS, STATUS_STOPPED)
            .putLong(KEY_STOPPED_AT_MS, System.currentTimeMillis())
            .putBoolean(KEY_COLLECTION_ACTIVE, false)
            .putString(KEY_EVENTS, eventsWith(context, "STOP", System.currentTimeMillis(), false).toString())
            .commit();
    }

    public static void clearSession(Context context, String sessionId) {
        if (sessionId != null && !sessionId.isEmpty()) {
            deleteSessionFile(context, sessionId);
        }

        if (sessionId == null || !sessionId.equals(getSessionId(context))) return;

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
            .remove(KEY_STOPPED_AT_MS)
            .remove(KEY_OWNER).remove(KEY_EVENTS).remove(KEY_COLLECTION_ACTIVE).remove(KEY_LAST_COLLECTION_AT).remove(KEY_TRACE_WARNING)
            .commit();
        scannedSessionId = null;
        cachedScan = null;
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

    public static void appendPoint(Context context, String sessionId, JSObject point) throws IOException {
        if (sessionId == null || sessionId.isEmpty()) {
            return;
        }

        synchronized (FILE_LOCK) {
            if (!sessionId.equals(scannedSessionId) || cachedScan == null) {
                cachedScan = scan(context, sessionId, null);
                scannedSessionId = sessionId;
                if (cachedScan.truncatedTail) getPrefs(context).edit().putBoolean(KEY_TRACE_WARNING, true).commit();
            }
            point.put("sequence", cachedScan.lastSequence + 1);
            try { LiveTrackingFile.append(getSessionFile(context, sessionId), cachedScan, point.toString()); }
            catch (IOException error) { cachedScan = null; throw error; }
            getPrefs(context).edit().putLong(KEY_LAST_SEQUENCE, cachedScan.lastSequence)
                .putInt(KEY_POINTS_RECORDED, cachedScan.lastSequence).commit();
        }
    }

    public static JSArray readPointsAfter(Context context, String sessionId, int afterSequence) throws IOException {
        JSArray result = new JSArray();
        if (sessionId == null || sessionId.isEmpty()) {
            return result;
        }

        synchronized (FILE_LOCK) {
            LiveTrackingFile.Scan valid = scan(context, sessionId, line -> {
                JSONObject object = new JSONObject(line);
                if (object.getInt("sequence") > afterSequence) result.put(new JSObject(line));
            });
            if (sessionId.equals(getSessionId(context))) getPrefs(context).edit()
                .putLong(KEY_LAST_SEQUENCE, valid.lastSequence).putInt(KEY_POINTS_RECORDED, valid.lastSequence).commit();
        }

        return result;
    }

    private static LiveTrackingFile.Scan scan(Context context, String sessionId, LiveTrackingFile.Visitor visitor) throws IOException {
        return LiveTrackingFile.scan(getSessionFile(context, sessionId), line -> {
            JSONObject point = new JSONObject(line);
            if (!sessionId.equals(point.optString("sessionId", null)) || !point.has("latitude") || !point.has("longitude") ||
                !point.has("timestamp") || !point.has("sequence")) throw new IOException("GPS_POINT_INVALID");
            try {
                double latitude = point.getDouble("latitude"), longitude = point.getDouble("longitude");
                if (!Double.isFinite(latitude) || !Double.isFinite(longitude) || Math.abs(latitude) > 90 ||
                    Math.abs(longitude) > 180 || point.getLong("timestamp") <= 0) throw new IOException("GPS_POINT_INVALID");
                return point.getInt("sequence");
            } catch (org.json.JSONException error) { throw new IOException("GPS_POINT_INVALID", error); }
        }, visitor);
    }

    public static String getOwner(Context context) { return getPrefs(context).getString(KEY_OWNER, null); }

    private static JSONObject event(String type, long atMs, boolean estimated) {
        JSONObject result = new JSONObject();
        try { result.put("type", type); result.put("atMs", atMs); result.put("estimated", estimated); }
        catch (Exception error) { throw new IllegalStateException(error); }
        return result;
    }

    public static JSONArray getEvents(Context context) {
        try { return new JSONArray(getPrefs(context).getString(KEY_EVENTS, "[]")); }
        catch (Exception error) { throw new IllegalStateException("LIVE_JOURNAL_CORRUPTED", error); }
    }

    private static JSONArray eventsWith(Context context, String type, long atMs, boolean estimated) {
        return getEvents(context).put(event(type, atMs, estimated));
    }

    public static void heartbeat(Context context) {
        if (getPrefs(context).getBoolean(KEY_COLLECTION_ACTIVE, false)) getPrefs(context).edit()
            .putLong(KEY_LAST_COLLECTION_AT, System.currentTimeMillis()).commit();
    }

    public static void markInterrupted(Context context) {
        if (!getPrefs(context).getBoolean(KEY_COLLECTION_ACTIVE, false)) return;
        getPrefs(context).edit().putBoolean(KEY_COLLECTION_ACTIVE, false)
            .putString(KEY_EVENTS, eventsWith(context, "INTERRUPTION",
                lastKnownCollectionAt(context), true).toString()).commit();
    }

    private static long lastKnownCollectionAt(Context context) {
        final long[] last = { getPrefs(context).getLong(KEY_LAST_COLLECTION_AT, getStartedAtMs(context)) };
        try { scan(context, getSessionId(context), line -> {
            last[0] = Math.max(last[0], new JSONObject(line).getLong("timestamp"));
        }); } catch (IOException error) { throw new IllegalStateException("LIVE_TRACE_CORRUPTED", error); }
        return Math.min(System.currentTimeMillis(), last[0]);
    }

    public static void markCollectionStarted(Context context) {
        getPrefs(context).edit().putBoolean(KEY_COLLECTION_ACTIVE, true)
            .putLong(KEY_LAST_COLLECTION_AT, System.currentTimeMillis())
            .putString(KEY_EVENTS, eventsWith(context, "COLLECTION_RESUME", System.currentTimeMillis(), false).toString()).commit();
    }

    public static JSObject recovery(Context context, String owner, boolean serviceRunning) throws IOException {
        return recovery(context, owner, serviceRunning, true);
    }

    private static JSObject recovery(Context context, String owner, boolean serviceRunning, boolean includePoints) throws IOException {
        JSObject result = new JSObject();
        String sessionId = getSessionId(context);
        if (sessionId == null) { result.put("session", null); return result; }
        if (owner == null || !owner.equals(getOwner(context))) { result.put("blocked", true); return result; }
        synchronized (FILE_LOCK) {
            JSObject session = new JSObject();
            JSArray points = includePoints ? readPointsAfter(context, sessionId, 0) : new JSArray();
            LiveTrackingFile.Scan valid = scan(context, sessionId, null);
            JSONArray events = getEvents(context);
            if (!serviceRunning && getPrefs(context).getBoolean(KEY_COLLECTION_ACTIVE, false))
                events.put(event("INTERRUPTION", lastKnownCollectionAt(context), true));
            session.put("sessionId", sessionId); session.put("ownerUserId", getOwner(context));
            session.put("sport", getSport(context)); session.put("startedAtMs", getStartedAtMs(context));
            session.put("trackingStatus", getStatus(context)); session.put("serviceRunning", serviceRunning);
            session.put("lastSequence", valid.lastSequence); session.put("points", points);
            session.put("events", events); session.put("truncatedTail", valid.truncatedTail || getPrefs(context).getBoolean(KEY_TRACE_WARNING, false));
            session.put("stoppedAtMs", getPrefs(context).getLong(KEY_STOPPED_AT_MS, 0L));
            result.put("session", session);
        }
        return result;
    }

    public static JSObject pending(Context context, String sessionId, String owner, int afterSequence, boolean running) throws IOException {
        synchronized (FILE_LOCK) {
            JSObject result = new JSObject();
            JSArray points = readPointsAfter(context, sessionId, afterSequence);
            JSObject session = recovery(context, owner, running, false).getJSObject("session");
            if (session == null) throw new IOException("LIVE_OWNER_MISMATCH");
            result.put("sessionId", sessionId); result.put("points", points);
            result.put("lastSequence", session.getInteger("lastSequence")); result.put("recovery", session);
            return result;
        }
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
        result.put("trackingStatus", trackingStatus);
        result.put("finalizationVersion", 1);
        result.put("recoveryVersion", 1);
        result.put("ownerUserId", getOwner(context));
        result.put("stoppedAtMs", getPrefs(context).getLong(KEY_STOPPED_AT_MS, 0L) > 0
            ? getPrefs(context).getLong(KEY_STOPPED_AT_MS, 0L) : null);
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
