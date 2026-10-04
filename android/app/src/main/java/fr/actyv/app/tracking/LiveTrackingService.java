package fr.actyv.app.tracking;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.os.Handler;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import java.io.IOException;

public class LiveTrackingService extends Service {
    public static final String ACTION_START = "fr.actyv.app.tracking.START";
    public static final String ACTION_PAUSE = "fr.actyv.app.tracking.PAUSE";
    private boolean acceptingLocations = true;
    public static final String ACTION_RESUME = "fr.actyv.app.tracking.RESUME";
    public static final String ACTION_STOP = "fr.actyv.app.tracking.STOP";
    public static final String ACTION_RECOVER = "fr.actyv.app.tracking.RECOVER";
    public static final String EXTRA_OWNER = "ownerUserId";

    public static final String BROADCAST_LOCATION_UPDATE = "fr.actyv.app.tracking.LOCATION_UPDATE";
    public static final String BROADCAST_STATUS = "fr.actyv.app.tracking.STATUS";
    public static final String BROADCAST_ERROR = "fr.actyv.app.tracking.ERROR";

    public static final String EXTRA_SESSION_ID = "sessionId";
    public static final String EXTRA_SPORT = "sport";
    public static final String EXTRA_STARTED_AT_MS = "startedAtMs";
    public static final String EXTRA_PAUSED_AT_MS = "pausedAtMs";
    public static final String EXTRA_ACCUMULATED_PAUSED_MS = "accumulatedPausedMs";

    private static final String TAG = "LiveTrackingService";
    private static final String CHANNEL_ID = "actyv_live_tracking";
    private static final int NOTIFICATION_ID = 42001;
    private static final long UPDATE_INTERVAL_MS = 2_000L;
    private static final long FASTEST_INTERVAL_MS = 1_000L;
    private static final float MIN_DISTANCE_M = 3f;

    private static volatile boolean serviceRunning = false;

    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private static volatile boolean locationUpdatesStarted = false;
    private boolean stopping = false;
    private String sessionId;
    private String sport;
    private String trackingStatus = LiveTrackingManager.STATUS_IDLE;
    private final Handler heartbeatHandler = new Handler(Looper.getMainLooper());
    private final Runnable heartbeat = new Runnable() {
        @Override public void run() {
            LiveTrackingManager.heartbeat(LiveTrackingService.this);
            heartbeatHandler.postDelayed(this, 10000);
        }
    };

    public static boolean isServiceRunning() {
        return serviceRunning;
    }

    public static boolean isCollecting() { return serviceRunning && locationUpdatesStarted; }

    @Override
    public void onCreate() {
        super.onCreate();
        serviceRunning = true;
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        createNotificationChannel();
        createLocationCallback();
        Log.i(TAG, "LiveTrackingService created");
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            restorePersistedSessionIfNeeded();
            return START_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_START.equals(action)) {
            handleStart(intent);
        } else if (ACTION_RECOVER.equals(action)) {
            restorePersistedSessionIfNeeded();
        } else if (ACTION_PAUSE.equals(action)) {
            handlePause(intent);
        } else if (ACTION_RESUME.equals(action)) {
            handleResume(intent);
        } else if (ACTION_STOP.equals(action)) {
            handleStop();
            return START_NOT_STICKY;
        }

        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        acceptingLocations = false;
        heartbeatHandler.removeCallbacks(heartbeat);
        if (!LiveTrackingManager.STATUS_STOPPED.equals(trackingStatus)) {
            try { LiveTrackingManager.markInterrupted(this); }
            catch (Exception error) { Log.e(TAG, "Unable to journal interruption; trace preserved", error); }
        }
        stopLocationUpdates();
        stopForeground(STOP_FOREGROUND_REMOVE);
        serviceRunning = false;
        Log.i(TAG, "LiveTrackingService destroyed");
        super.onDestroy();
    }

    private void restorePersistedSessionIfNeeded() {
        String persistedSessionId = LiveTrackingManager.getSessionId(this);
        String persistedSport = LiveTrackingManager.getSport(this);
        String persistedStatus = LiveTrackingManager.getStatus(this);

        if (persistedSessionId == null || persistedSport == null ||
            LiveTrackingManager.STATUS_STOPPED.equals(persistedStatus)) {
            stopSelf();
            return;
        }

        sessionId = persistedSessionId;
        sport = persistedSport;
        trackingStatus = persistedStatus;
        startForeground(NOTIFICATION_ID, buildNotification());
        try { LiveTrackingManager.markInterrupted(this); }
        catch (Exception error) {
            broadcastError("Trace Live invalide. Les donnees sont conservees.");
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return;
        }
        startLocationUpdates();
    }

    private void handleStart(Intent intent) {
        String nextSessionId = intent.getStringExtra(EXTRA_SESSION_ID);
        String nextSport = intent.getStringExtra(EXTRA_SPORT);
        long startedAtMs = intent.getLongExtra(EXTRA_STARTED_AT_MS, System.currentTimeMillis());
        long accumulatedPausedMs = intent.getLongExtra(EXTRA_ACCUMULATED_PAUSED_MS, 0L);

        if (nextSessionId == null || nextSessionId.isEmpty() || nextSport == null || nextSport.isEmpty()) {
            broadcastError("Session Live invalide.");
            stopSelf();
            return;
        }

        sessionId = nextSessionId;
        sport = nextSport;
        trackingStatus = LiveTrackingManager.STATUS_RUNNING;

        try {
            LiveTrackingManager.beginSession(this, sessionId, sport, startedAtMs, accumulatedPausedMs,
                intent.getStringExtra(EXTRA_OWNER));
        } catch (Exception error) {
            broadcastError("Une activite non resolue existe deja. Recupere-la avant de demarrer.");
            stopSelf();
            return;
        }
        startForeground(NOTIFICATION_ID, buildNotification());
        startLocationUpdates();
        Log.i(TAG, "Live tracking started for session " + sessionId);
    }

    private void handlePause(Intent intent) {
        long pausedAtMs = intent.getLongExtra(EXTRA_PAUSED_AT_MS, System.currentTimeMillis());
        long accumulatedPausedMs = intent.getLongExtra(
            EXTRA_ACCUMULATED_PAUSED_MS,
            LiveTrackingManager.getAccumulatedPausedMs(this)
        );

        trackingStatus = LiveTrackingManager.STATUS_PAUSED;
        LiveTrackingManager.markPaused(this, pausedAtMs, accumulatedPausedMs);
        updateNotification();
        broadcastStatus("Suivi mis en pause.");
        Log.i(TAG, "Live tracking paused");
    }

    private void handleResume(Intent intent) {
        long accumulatedPausedMs = intent.getLongExtra(
            EXTRA_ACCUMULATED_PAUSED_MS,
            LiveTrackingManager.getAccumulatedPausedMs(this)
        );

        trackingStatus = LiveTrackingManager.STATUS_RUNNING;
        LiveTrackingManager.markRunning(this, accumulatedPausedMs, intent.getLongExtra("resumedAtMs", System.currentTimeMillis()));
        updateNotification();
        broadcastStatus("Suivi repris.");
        Log.i(TAG, "Live tracking resumed");
    }

    private void handleStop() {
        if (stopping) return;
        stopping = true;
        // Deliver any provider batch before removing the callback. Keep the NDJSON trace.
        fusedLocationClient.flushLocations().addOnCompleteListener(flush -> {
            if (!flush.isSuccessful()) {
                stopping = false;
                broadcastError("Impossible de recuperer les derniers points GPS. Reessaie.");
                return;
            }
            fusedLocationClient.removeLocationUpdates(locationCallback).addOnCompleteListener(removed -> {
                if (!removed.isSuccessful()) {
                    stopping = false;
                    broadcastError("Impossible d'arreter la collecte GPS. Reessaie.");
                    return;
                }
                locationUpdatesStarted = false;
                completeStop();
            });
        });
    }

    private void completeStop() {
        heartbeatHandler.removeCallbacks(heartbeat);
        trackingStatus = LiveTrackingManager.STATUS_STOPPED;
        LiveTrackingManager.markStopped(this);
        serviceRunning = false;
        broadcastStatus("Suivi GPS arrêté.");
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        Log.i(TAG, "Live tracking stopped");
    }

    private void createLocationCallback() {
        locationCallback =
            new LocationCallback() {
                @Override
                public void onLocationResult(LocationResult locationResult) {
                    if (locationResult == null || locationResult.getLocations().isEmpty()) {
                        return;
                    }

                    for (Location location : locationResult.getLocations()) {
                        handleLocation(location);
                    }
                }
            };
    }

    private void handleLocation(Location location) {
        if (!acceptingLocations || sessionId == null || sessionId.isEmpty() || LiveTrackingManager.STATUS_STOPPED.equals(trackingStatus)) {
            return;
        }

        try {
            JSObject point = new JSObject();
            point.put("sessionId", sessionId);
            point.put("trackingPaused", LiveTrackingManager.STATUS_PAUSED.equals(trackingStatus));
            point.put("latitude", location.getLatitude());
            point.put("longitude", location.getLongitude());
            point.put("altitude", location.hasAltitude() ? location.getAltitude() : null);
            point.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : null);
            point.put(
                "altitudeAccuracy",
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasVerticalAccuracy()
                    ? location.getVerticalAccuracyMeters()
                    : null
            );
            point.put("speed", location.hasSpeed() ? location.getSpeed() : null);
            point.put("heading", location.hasBearing() ? location.getBearing() : null);
            point.put("timestamp", location.getTime() > 0 ? location.getTime() : System.currentTimeMillis());

            LiveTrackingManager.appendPoint(this, sessionId, point);
            broadcastLocation(point);
        } catch (IOException error) {
            Log.e(TAG, "Unable to persist tracking point", error);
            broadcastError("Impossible d'enregistrer un point GPS localement.");
        }
    }

    private void startLocationUpdates() {
        if (locationUpdatesStarted) {
            return;
        }

        boolean fineGranted =
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean coarseGranted =
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;

        if (!fineGranted && !coarseGranted) {
            broadcastError("Autorise la localisation pour démarrer le Live.");
            return;
        }

        try {
            LocationRequest request =
                new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, UPDATE_INTERVAL_MS)
                    .setMinUpdateIntervalMillis(FASTEST_INTERVAL_MS)
                    .setMinUpdateDistanceMeters(MIN_DISTANCE_M)
                    .build();

            fusedLocationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
                .addOnCompleteListener(task -> {
                    if (!task.isSuccessful()) {
                        broadcastError("Impossible de demarrer la collecte GPS. Les donnees sont conservees.");
                        return;
                    }
                    locationUpdatesStarted = true;
                    LiveTrackingManager.markCollectionStarted(this);
                    heartbeatHandler.removeCallbacks(heartbeat);
                    heartbeatHandler.post(heartbeat);
                    broadcastStatus("Suivi GPS actif.");
                });
            Log.i(TAG, "Location updates started");
        } catch (SecurityException error) {
            Log.e(TAG, "Location permission missing", error);
            broadcastError("La permission de localisation précise est requise.");
        } catch (Exception error) {
            Log.e(TAG, "Failed to start location updates", error);
            broadcastError("Impossible de démarrer le suivi GPS.");
        }
    }

    private void stopLocationUpdates() {
        if (!locationUpdatesStarted) {
            return;
        }

        fusedLocationClient.removeLocationUpdates(locationCallback);
        locationUpdatesStarted = false;
        Log.i(TAG, "Location updates stopped");
    }

    private Notification buildNotification() {
        String sportLabel = getSportLabel(sport);
        String title =
            LiveTrackingManager.STATUS_PAUSED.equals(trackingStatus)
                ? "Actyv - " + sportLabel + " en pause"
                : "Actyv - " + sportLabel + " en cours";
        String contentText =
            LiveTrackingManager.STATUS_PAUSED.equals(trackingStatus)
                ? "Suivi GPS actif, activité en pause."
                : "Suivi GPS actif";

        NotificationCompat.Builder builder =
            new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(contentText)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .setPriority(NotificationCompat.PRIORITY_LOW);

        return builder.build();
    }

    private void updateNotification() {
        NotificationManager notificationManager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.notify(NOTIFICATION_ID, buildNotification());
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager notificationManager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) {
            return;
        }

        NotificationChannel channel =
            new NotificationChannel(
                CHANNEL_ID,
                "Actyv Live Tracking",
                NotificationManager.IMPORTANCE_LOW
            );
        channel.setDescription("Suivi GPS des activités Live Actyv");
        notificationManager.createNotificationChannel(channel);
    }

    private void broadcastLocation(JSObject point) {
        Intent intent = new Intent(BROADCAST_LOCATION_UPDATE);
        intent.setPackage(getPackageName());
        intent.putExtra("payload", point.toString());
        sendBroadcast(intent);
    }

    private void broadcastStatus(String message) {
        Intent intent = new Intent(BROADCAST_STATUS);
        intent.setPackage(getPackageName());
        intent.putExtra(
            "payload",
            LiveTrackingManager.buildStatus(
                this,
                serviceRunning,
                LiveTrackingManager.getLocationPermissionStatus(this),
                LiveTrackingManager.getNotificationPermissionStatus(this),
                message
            ).toString()
        );
        sendBroadcast(intent);
    }

    private void broadcastError(String message) {
        Intent intent = new Intent(BROADCAST_ERROR);
        intent.setPackage(getPackageName());
        JSObject payload = new JSObject();
        payload.put("message", message);
        intent.putExtra("payload", payload.toString());
        sendBroadcast(intent);
    }

    private String getSportLabel(String sportSlug) {
        if (sportSlug == null) {
            return "Activité";
        }

        switch (sportSlug) {
            case "course-a-pied":
                return "Course à pied";
            case "trail":
                return "Trail";
            case "marche":
                return "Marche";
            case "velo":
                return "Vélo";
            case "vtt":
                return "VTT";
            default:
                return "Activité";
        }
    }
}
