package fr.actyv.app.health;

import androidx.activity.result.ActivityResultLauncher;
import androidx.annotation.NonNull;
import androidx.health.connect.client.HealthConnectClient;
import androidx.health.connect.client.PermissionController;
import androidx.health.connect.client.permission.HealthPermission;
import androidx.health.connect.client.records.DistanceRecord;
import androidx.health.connect.client.records.ExerciseSessionRecord;
import androidx.health.connect.client.records.StepsRecord;
import androidx.health.connect.client.request.ReadRecordsRequest;
import androidx.health.connect.client.time.TimeRangeFilter;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PluginMethod;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(name = "HealthConnect")
public class HealthConnectPlugin extends Plugin {
    private static final String HEALTH_CONNECT_PACKAGE = "com.google.android.apps.healthdata";

    private static final Set<String> REQUIRED_PERMISSIONS = new HashSet<>(
        Arrays.asList(
            HealthPermission.getReadPermission(StepsRecord.class),
            HealthPermission.getReadPermission(DistanceRecord.class),
            HealthPermission.getReadPermission(ExerciseSessionRecord.class)
        )
    );

    private static final Set<Integer> WALK_RUN_EXERCISE_TYPES = new HashSet<>();
    private static final Set<Integer> BIKE_EXERCISE_TYPES = new HashSet<>();

    static {
        addExerciseType(WALK_RUN_EXERCISE_TYPES, "EXERCISE_TYPE_WALKING");
        addExerciseType(WALK_RUN_EXERCISE_TYPES, "EXERCISE_TYPE_WALKING_TREADMILL");
        addExerciseType(WALK_RUN_EXERCISE_TYPES, "EXERCISE_TYPE_RUNNING");
        addExerciseType(WALK_RUN_EXERCISE_TYPES, "EXERCISE_TYPE_RUNNING_TREADMILL");
        addExerciseType(WALK_RUN_EXERCISE_TYPES, "EXERCISE_TYPE_HIKING");

        addExerciseType(BIKE_EXERCISE_TYPES, "EXERCISE_TYPE_BIKING");
        addExerciseType(BIKE_EXERCISE_TYPES, "EXERCISE_TYPE_BIKING_STATIONARY");
    }

    private ActivityResultLauncher<Set<String>> permissionLauncher;
    private PluginCall pendingPermissionCall;

    @Override
    public void load() {
        permissionLauncher = bridge.registerForActivityResult(
            PermissionController.createRequestPermissionResultContract(),
            this::handlePermissionResult
        );
    }

    @PluginMethod
    public void isHealthConnectAvailable(PluginCall call) {
        JSObject result = buildAvailabilityResult();
        call.resolve(result);
    }

    @PluginMethod
    public void requestHealthPermissions(PluginCall call) {
        JSObject availability = buildAvailabilityResult();
        if (!availability.getBool("available")) {
            call.resolve(availability);
            return;
        }

        if (permissionLauncher == null) {
            call.reject("Health Connect permissions launcher unavailable.");
            return;
        }

        pendingPermissionCall = call;
        bridge.saveCall(call);
        permissionLauncher.launch(REQUIRED_PERMISSIONS);
    }

    @PluginMethod
    public void readTodayHealthData(PluginCall call) {
        resolveTodayHealthData(call);
    }

    @PluginMethod
    public void syncTodayHealthData(PluginCall call) {
        resolveTodayHealthData(call);
    }

    private void handlePermissionResult(Set<String> grantedPermissions) {
        PluginCall call = pendingPermissionCall;
        pendingPermissionCall = null;

        if (call == null) {
            return;
        }

        JSObject result = buildAvailabilityResult();
        boolean granted = grantedPermissions != null && grantedPermissions.containsAll(REQUIRED_PERMISSIONS);
        result.put("granted", granted);
        result.put("message", granted ? "Permissions Health Connect accordees." : "Permissions Health Connect refusees.");
        call.resolve(result);
        bridge.releaseCall(call);
    }

    private void resolveTodayHealthData(PluginCall call) {
        JSObject availability = buildAvailabilityResult();
        if (!availability.getBool("available")) {
            availability.put("granted", false);
            availability.put("stepsCount", 0);
            availability.put("distanceMeters", null);
            availability.put("walkRunDistanceMeters", null);
            availability.put("bikeDistanceMeters", null);
            availability.put("syncedAt", null);
            call.resolve(availability);
            return;
        }

        try {
            HealthConnectClient client = HealthConnectClient.getOrCreate(getContext());
            HealthConnectSummary summary = readTodaySummary(client);
            JSObject result = buildAvailabilityResult();
            result.put("granted", true);
            result.put("stepsCount", summary.stepsCount);
            result.put("distanceMeters", summary.distanceMeters);
            result.put("walkRunDistanceMeters", summary.walkRunDistanceMeters);
            result.put("bikeDistanceMeters", summary.bikeDistanceMeters);
            result.put("syncedAt", Instant.now().toString());
            result.put("message", "Lecture Health Connect reussie.");
            call.resolve(result);
        } catch (SecurityException securityException) {
            JSObject result = buildAvailabilityResult();
            result.put("granted", false);
            result.put("stepsCount", 0);
            result.put("distanceMeters", null);
            result.put("walkRunDistanceMeters", null);
            result.put("bikeDistanceMeters", null);
            result.put("syncedAt", null);
            result.put("message", "Permissions Health Connect manquantes.");
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Impossible de lire Health Connect.", exception);
        }
    }

    private JSObject buildAvailabilityResult() {
        int sdkStatus = HealthConnectClient.getSdkStatus(getContext());
        JSObject result = new JSObject();
        boolean available = sdkStatus == HealthConnectClient.SDK_AVAILABLE;
        result.put("available", available);
        result.put("sdkStatus", sdkStatus);
        result.put("needsUpdate", sdkStatus == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED);
        result.put(
            "message",
            available
                ? "Health Connect disponible."
                : sdkStatus == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
                    ? "Health Connect doit etre mis a jour."
                    : "Health Connect indisponible sur cet appareil."
        );
        return result;
    }

    private HealthConnectSummary readTodaySummary(@NonNull HealthConnectClient client) throws Exception {
        ZoneId zoneId = ZoneId.systemDefault();
        LocalDate today = LocalDate.now(zoneId);
        Instant start = today.atStartOfDay(zoneId).toInstant();
        Instant end = today.plusDays(1).atStartOfDay(zoneId).toInstant();
        TimeRangeFilter filter = TimeRangeFilter.between(start, end);

        List<?> stepsRecords = client.readRecords(new ReadRecordsRequest<>(StepsRecord.class, filter)).getRecords();
        List<?> distanceRecords = client.readRecords(new ReadRecordsRequest<>(DistanceRecord.class, filter)).getRecords();
        List<?> exerciseRecords = client.readRecords(new ReadRecordsRequest<>(ExerciseSessionRecord.class, filter)).getRecords();

        long stepsCount = 0;
        for (Object record : stepsRecords) {
            stepsCount += getLongProperty(record, "getCount", "count");
        }

        double totalDistanceMeters = 0;
        double walkRunDistanceMeters = 0;
        double bikeDistanceMeters = 0;

        for (Object record : distanceRecords) {
            double distanceMeters = getDistanceMeters(record);
            totalDistanceMeters += distanceMeters;

            Instant recordStart = getInstantProperty(record, "getStartTime", "startTime");
            Instant recordEnd = getInstantProperty(record, "getEndTime", "endTime");
            if (recordStart == null || recordEnd == null) {
                continue;
            }

            boolean matchedBike = overlapsAnySession(recordStart, recordEnd, exerciseRecords, BIKE_EXERCISE_TYPES);
            boolean matchedWalkRun = overlapsAnySession(recordStart, recordEnd, exerciseRecords, WALK_RUN_EXERCISE_TYPES);

            if (matchedBike) {
                bikeDistanceMeters += distanceMeters;
            } else if (matchedWalkRun) {
                walkRunDistanceMeters += distanceMeters;
            }
        }

        return new HealthConnectSummary(
            stepsCount,
            totalDistanceMeters > 0 ? totalDistanceMeters : null,
            walkRunDistanceMeters > 0 ? walkRunDistanceMeters : null,
            bikeDistanceMeters > 0 ? bikeDistanceMeters : null
        );
    }

    private boolean overlapsAnySession(
        Instant recordStart,
        Instant recordEnd,
        List<?> exerciseRecords,
        Set<Integer> acceptedTypes
    ) {
        for (Object exerciseRecord : exerciseRecords) {
            Integer exerciseType = getIntProperty(exerciseRecord, "getExerciseType", "exerciseType");
            if (exerciseType == null || !acceptedTypes.contains(exerciseType)) {
                continue;
            }

            Instant sessionStart = getInstantProperty(exerciseRecord, "getStartTime", "startTime");
            Instant sessionEnd = getInstantProperty(exerciseRecord, "getEndTime", "endTime");
            if (sessionStart == null || sessionEnd == null) {
                continue;
            }

            boolean startsBeforeSessionEnds = !recordStart.isAfter(sessionEnd);
            boolean endsAfterSessionStarts = !recordEnd.isBefore(sessionStart);
            if (startsBeforeSessionEnds && endsAfterSessionStarts) {
                return true;
            }
        }

        return false;
    }

    private static void addExerciseType(Set<Integer> target, String fieldName) {
        Integer value = getStaticIntField(ExerciseSessionRecord.class, fieldName);
        if (value != null) {
            target.add(value);
        }
    }

    private static Integer getStaticIntField(Class<?> clazz, String fieldName) {
        try {
            Field field = clazz.getField(fieldName);
            return field.getInt(null);
        } catch (Exception exception) {
            return null;
        }
    }

    private static long getLongProperty(Object instance, String... methodNames) {
        Number number = (Number) getProperty(instance, methodNames);
        return number == null ? 0L : number.longValue();
    }

    private static Integer getIntProperty(Object instance, String... methodNames) {
        Number number = (Number) getProperty(instance, methodNames);
        return number == null ? null : number.intValue();
    }

    private static Instant getInstantProperty(Object instance, String... methodNames) {
        Object value = getProperty(instance, methodNames);
        return value instanceof Instant ? (Instant) value : null;
    }

    private static Object getProperty(Object instance, String... methodNames) {
        if (instance == null) {
            return null;
        }

        for (String methodName : methodNames) {
            try {
                Method method = instance.getClass().getMethod(methodName);
                return method.invoke(instance);
            } catch (Exception ignored) {
                // Try next accessor.
            }
        }

        return null;
    }

    private static double getDistanceMeters(Object distanceRecord) {
        Object distance = getProperty(distanceRecord, "getDistance", "distance");
        if (distance == null) {
            return 0;
        }

        Object meters = getProperty(distance, "getInMeters", "inMeters", "getMeters", "meters");
        if (meters instanceof Number) {
            return ((Number) meters).doubleValue();
        }

        Object value = getProperty(distance, "getValue", "value");
        if (value instanceof Number) {
            return ((Number) value).doubleValue();
        }

        return 0;
    }

    private static class HealthConnectSummary {
        final long stepsCount;
        final Double distanceMeters;
        final Double walkRunDistanceMeters;
        final Double bikeDistanceMeters;

        HealthConnectSummary(long stepsCount, Double distanceMeters, Double walkRunDistanceMeters, Double bikeDistanceMeters) {
            this.stepsCount = stepsCount;
            this.distanceMeters = distanceMeters;
            this.walkRunDistanceMeters = walkRunDistanceMeters;
            this.bikeDistanceMeters = bikeDistanceMeters;
        }
    }
}
