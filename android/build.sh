#!/usr/bin/env bash
# Builds the AMS Android app (android/AMS.apk) without Android Studio.
# Needs: Java 17+, Python 3, and a tools folder with:
#   aapt2 (Android build tools), android.jar (API 33), dx.jar (com.google.android.tools:dx:1.7 from Maven Central),
#   apksig.jar (com.android.tools.build:apksig:2.3.0 from Maven Central)
# usage: TOOLS=/path/to/tools KEYSTORE=/path/to/ams-release.p12 KEYPASS=... ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
: "${TOOLS:?set TOOLS}" "${KEYSTORE:?set KEYSTORE}" "${KEYPASS:?set KEYPASS}"
OUT=build; rm -rf $OUT; mkdir -p $OUT/res $OUT/gen $OUT/classes

"$TOOLS/aapt2" compile --dir res -o $OUT/res/compiled.zip
"$TOOLS/aapt2" link -o $OUT/base.apk -I "$TOOLS/android.jar" --manifest AndroidManifest.xml --java $OUT/gen $OUT/res/compiled.zip --auto-add-overlay

# Java 8 bytecode without lambdas; dx 1.7 reads class version 50 (Java 6), so the version byte is lowered (no Java 8-only features are used).
javac -nowarn --release 8 -cp "$TOOLS/android.jar" -d $OUT/classes $(find src $OUT/gen -name '*.java') 2>&1 | grep -v "bootstrap\|^1 warning\|^warning: \[options\]" || true
find $OUT/classes -name '*.class' -exec python3 -c 'import sys
for p in sys.argv[1:]:
    b=bytearray(open(p,"rb").read()); b[7]=50; open(p,"wb").write(b)' {} +
java -cp "$TOOLS/dx.jar" com.android.dx.command.Main --dex --output=$OUT/classes.dex $OUT/classes

python3 buildtools/align.py $OUT/base.apk $OUT/aligned.apk $OUT/classes.dex=classes.dex
mkdir -p $OUT/signer && javac -nowarn -cp "$TOOLS/apksig.jar" -d $OUT/signer buildtools/Sign.java
java --add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED --add-exports java.base/sun.security.util=ALL-UNNAMED -cp "$TOOLS/apksig.jar:$OUT/signer" Sign "$KEYSTORE" ams "$KEYPASS" $OUT/aligned.apk AMS.apk
echo "Built android/AMS.apk"
