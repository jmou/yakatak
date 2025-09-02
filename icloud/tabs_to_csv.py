import csv
import json
import sqlite3
import sys
import zlib

_, db_path = sys.argv

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

tabs = []

for row in conn.execute(
    "SELECT device_uuid, tab_uuid, url, title, position FROM cloud_tabs"
):
    position = json.loads(zlib.decompress(row["position"]))
    tabs.append((position["sortValues"][0]["sortValue"], row))

writer = csv.writer(sys.stdout)
COLUMNS = ["device_uuid", "tab_uuid", "url", "title"]
writer.writerow(COLUMNS)
for _, row in sorted(tabs):
    writer.writerow([row[col] for col in COLUMNS])
