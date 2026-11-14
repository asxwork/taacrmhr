package com.theadvisorassociates.ams;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Lets the camera app write a full-size photo into the app's cache (content://…/camera/photo-123.jpg), which
 * then goes to the page's file input. Only files in cache/camera are served; the provider isn't exported.
 */
public class CameraFiles extends ContentProvider {
    static final String AUTHORITY = "com.theadvisorassociates.ams.files";
    private static File root;

    static Uri uriFor(File f) { return Uri.parse("content://" + AUTHORITY + "/camera/" + f.getName()); }

    static File fileFor(Uri u) {
        if (root == null || u == null || !AUTHORITY.equals(u.getAuthority())) return null;
        String name = u.getLastPathSegment();
        if (name == null || name.contains("/") || name.contains("..")) return null;
        return new File(root, name);
    }

    @Override public boolean onCreate() {
        root = new File(getContext().getCacheDir(), "camera");
        root.mkdirs();
        return true;
    }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(uri);
        if (f == null) throw new FileNotFoundException();
        int m = mode.contains("w") ? ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE : ParcelFileDescriptor.MODE_READ_ONLY;
        return ParcelFileDescriptor.open(f, m);
    }

    @Override public Cursor query(Uri uri, String[] projection, String sel, String[] args, String sort) {
        File f = fileFor(uri);
        MatrixCursor c = new MatrixCursor(new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE });
        if (f != null) c.addRow(new Object[] { f.getName(), f.length() });
        return c;
    }

    @Override public String getType(Uri uri) { return "image/jpeg"; }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String sel, String[] args) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String sel, String[] args) { return 0; }
}
