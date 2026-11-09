package com.kpflow.driver;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * ⭐ 2026-11-10 기사앱 서류 저장 — 웹화면(WebView)은 파일 내려받기(a[download])가 동작하지 않아 네이티브로 저장한다.
 *  - save({ data: base64, name, mime, share })
 *    · 안드로이드 10 이상: 휴대폰 "다운로드/LogisWeb" 폴더에 저장(권한 필요 없음)
 *    · share=true(기본): 저장 후 공유 창(카톡·드라이브·파일 등에 보내기/저장)을 띄운다
 */
@CapacitorPlugin(name = "KpSave")
public class KpSavePlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        String name = call.getString("name", "document");
        String mime = call.getString("mime", "application/octet-stream");
        Boolean shareOpt = call.getBoolean("share", true);
        boolean share = shareOpt == null || shareOpt;
        if (data == null || data.isEmpty()) { call.reject("NO_DATA"); return; }
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            boolean downloaded = false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    ContentResolver resolver = getContext().getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/LogisWeb");
                    Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri != null) {
                        OutputStream os = resolver.openOutputStream(uri);
                        if (os != null) { os.write(bytes); os.close(); downloaded = true; }
                    }
                } catch (Exception ignored) { downloaded = false; }
            }
            File dir = new File(getContext().getCacheDir(), "kpdocs");
            if (!dir.exists()) dir.mkdirs();
            File f = new File(dir, name);
            FileOutputStream fos = new FileOutputStream(f);
            fos.write(bytes);
            fos.close();
            if (share) {
                Uri shareUri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime);
                send.putExtra(Intent.EXTRA_STREAM, shareUri);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(send, name);
                chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().startActivity(chooser);
            }
            JSObject ret = new JSObject();
            ret.put("downloaded", downloaded);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("SAVE_FAILED", e);
        }
    }
}
