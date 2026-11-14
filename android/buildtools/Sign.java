import com.android.apksig.ApkSigner;
import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

/** Signs the APK (v2 scheme; the app needs Android 7.0+, which reads v2) with the release key. usage: Sign <keystore.p12> <alias> <password> <in.apk> <out.apk> */
public class Sign {
    public static void main(String[] a) throws Exception {
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream in = new FileInputStream(a[0])) { ks.load(in, a[2].toCharArray()); }
        PrivateKey key = (PrivateKey) ks.getKey(a[1], a[2].toCharArray());
        X509Certificate cert = (X509Certificate) ks.getCertificate(a[1]);
        ApkSigner.SignerConfig sc = new ApkSigner.SignerConfig.Builder("AMS", key, Collections.singletonList(cert)).build();
        new ApkSigner.Builder(Collections.singletonList(sc)).setInputApk(new File(a[3])).setOutputApk(new File(a[4])).setV1SigningEnabled(false).setV2SigningEnabled(true).build().sign();
        System.out.println("signed " + a[4]);
    }
}
