# Convert a HAR zipped with attachments (as produced by Playwright) to a
# standard HAR with embedded content.

import base64
import json
import sys
import zipfile


def embed_har(zip_file):
    with zipfile.ZipFile(zip_file) as zip:
        with zip.open("har.har") as har_fh:
            har = json.load(har_fh)

        for entry in har["log"]["entries"]:
            content = entry["response"]["content"]
            if "_file" in content:
                data = zip.read(content["_file"])
                try:
                    content["text"] = data.decode("utf-8")
                except UnicodeDecodeError:
                    content["text"] = base64.b64encode(data).decode("ascii")
                    content["encoding"] = "base64"
                del content["_file"]

    return har


def main():
    _, zip_file = sys.argv
    har = embed_har(zip_file)
    json.dump(har, sys.stdout)


if __name__ == "__main__":
    main()
