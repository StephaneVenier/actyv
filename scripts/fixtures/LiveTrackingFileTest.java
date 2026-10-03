import fr.actyv.app.tracking.LiveTrackingFile;
import java.io.File;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import java.io.IOException;
import java.util.regex.Pattern;

public class LiveTrackingFileTest {
    private static final Pattern POINT = Pattern.compile("\\{\"sequence\":(\\d+)\\}");
    private static int sequence(String line) {
        java.util.regex.Matcher match = POINT.matcher(line);
        if (!match.matches()) throw new IllegalArgumentException("incomplete JSON fixture");
        return Integer.parseInt(match.group(1));
    }
    private static void check(boolean ok, String message) { if (!ok) throw new AssertionError(message); }
    public static void main(String[] args) throws Exception {
        File file = new File(args[0], "points.ndjson");
        Files.writeString(file.toPath(), "{\"sequence\":1}\n{\"sequence\":2}\n{\"sequence\":", StandardCharsets.UTF_8);
        LiveTrackingFile.Scan scan = LiveTrackingFile.scan(file, LiveTrackingFileTest::sequence, null);
        check(scan.lastSequence == 2 && scan.truncatedTail, "C: previous records survive incomplete tail");
        int stalePreferencesCounter = 99;
        check(scan.lastSequence != stalePreferencesCounter, "D: file sequence overrides preferences");
        LiveTrackingFile.append(file, scan, "{\"sequence\":3}");
        check(LiveTrackingFile.scan(file, LiveTrackingFileTest::sequence, null).lastSequence == 3, "append repairs tail and continues sequence");
        Files.writeString(file.toPath(), "{\"sequence\":1}\nbroken\n{\"sequence\":2}\n");
        try { LiveTrackingFile.scan(file, LiveTrackingFileTest::sequence, null); throw new AssertionError("interior corruption ignored"); }
        catch (IOException expected) { }
        Files.writeString(file.toPath(), "{\"sequence\":1}\n{\"sequence\":3}");
        try { LiveTrackingFile.scan(file, LiveTrackingFileTest::sequence, null); throw new AssertionError("sequence gap ignored"); }
        catch (IOException expected) { }
        Files.writeString(file.toPath(), "{\"sequence\":1}");
        scan = LiveTrackingFile.scan(file, LiveTrackingFileTest::sequence, null);
        LiveTrackingFile.append(file, scan, "{\"sequence\":2}");
        check(LiveTrackingFile.scan(file, LiveTrackingFileTest::sequence, null).lastSequence == 2, "valid last line without newline retained");
        System.out.println("PASS native file C/D: truncated tail, file-authoritative counter, append, corruption detection");
    }
}
