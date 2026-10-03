package fr.actyv.app.tracking;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;

/** The file, not SharedPreferences, is authoritative for committed point sequences. */
public final class LiveTrackingFile {
    public interface Parser { int sequence(String line) throws Exception; }
    public interface Visitor { void accept(String line) throws Exception; }
    public static final class Scan {
        public int lastSequence;
        public long validLength;
        public boolean truncatedTail;
        public boolean needsNewline;
    }

    public static Scan scan(File file, Parser parser, Visitor visitor) throws IOException {
        Scan result = new Scan();
        if (!file.exists()) return result;
        try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
            while (input.getFilePointer() < input.length()) {
                long start = input.getFilePointer();
                String raw = input.readLine();
                long end = input.getFilePointer();
                input.seek(end - 1);
                boolean terminated = input.read() == '\n';
                input.seek(end);
                String line = new String(raw.getBytes(StandardCharsets.ISO_8859_1), StandardCharsets.UTF_8);
                try {
                    int sequence = parser.sequence(line);
                    if (sequence != result.lastSequence + 1) throw new IOException("GPS_SEQUENCE_CORRUPTED");
                    if (visitor != null) visitor.accept(line);
                    result.lastSequence = sequence;
                    result.validLength = end;
                    result.needsNewline = !terminated;
                } catch (Exception error) {
                    if (!terminated && end == input.length()) {
                        // Only an incomplete final JSON record may be discarded, not a sequence gap.
                        try { parser.sequence(line); }
                        catch (Exception incomplete) {
                            if (!(incomplete instanceof IOException)) { result.truncatedTail = true; return result; }
                        }
                    }
                    throw new IOException("GPS_FILE_CORRUPTED_AT_" + start, error);
                }
            }
        }
        return result;
    }

    public static void append(File file, Scan scan, String line) throws IOException {
        File parent = file.getParentFile();
        if (!parent.exists() && !parent.mkdirs()) throw new IOException("GPS_DIRECTORY_UNAVAILABLE");
        try (RandomAccessFile output = new RandomAccessFile(file, "rw")) {
            output.setLength(scan.validLength);
            output.seek(scan.validLength);
            if (scan.needsNewline) output.write('\n');
            output.write(line.getBytes(StandardCharsets.UTF_8));
            output.write('\n');
            output.getFD().sync();
            scan.validLength = output.length();
            scan.lastSequence++;
            scan.needsNewline = false;
            scan.truncatedTail = false;
        }
    }
}
