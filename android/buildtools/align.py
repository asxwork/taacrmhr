"""Rebuilds an APK so every uncompressed entry starts on a 4-byte boundary (what zipalign does).
usage: align.py <in.apk> <out.apk> [extra-file=name-in-apk ...]"""
import sys, zipfile

src, dst, extras = sys.argv[1], sys.argv[2], sys.argv[3:]
with zipfile.ZipFile(src) as zin, open(dst, "wb") as raw:
    zout = zipfile.ZipFile(raw, "w")
    items = [(i, zin.read(i.filename)) for i in zin.infolist()]
    for spec in extras:
        path, name = spec.split("=", 1)
        zi = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        zi.compress_type = zipfile.ZIP_DEFLATED
        items.append((zi, open(path, "rb").read()))
    for info, data in items:
        zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
        zi.compress_type = info.compress_type
        zi.external_attr = info.external_attr
        if zi.compress_type == zipfile.ZIP_STORED:
            start = raw.tell() + 30 + len(zi.filename.encode())
            pad = (4 - start % 4) % 4
            zi.extra = b"\0" * pad
        zout.writestr(zi, data)
    zout.close()
print("aligned", dst)
