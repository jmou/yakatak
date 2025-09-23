This is written current as of macOS Tahoe 26.0.

Safari keeps a SQLite database of cross-device tabs at
`$HOME/Library/Containers/com.apple.Safari/Data/Library/Safari/CloudTabs.db`.
You likely need to allow Full Disk Access (System Preferences > Security &
Privacy) to the Terminal app to access it.

```sql
CREATE TABLE cloud_tab_devices(
    device_uuid TEXT PRIMARY KEY NOT NULL,
    system_fields BLOB NOT NULL,
    device_name TEXT,
    device_type_identifier TEXT,
    has_duplicate_device_name BOOLEAN DEFAULT 0,
    is_ephemeral_device BOOLEAN DEFAULT 0,
    last_modified REAL NOT NULL
);

CREATE TABLE cloud_tabs(
    tab_uuid TEXT PRIMARY KEY NOT NULL,
    system_fields BLOB NOT NULL,
    device_uuid TEXT NOT NULL,
    position BLOB NOT NULL,
    title TEXT,
    url TEXT NOT NULL,
    is_showing_reader BOOLEAN DEFAULT 0,
    is_pinned BOOLEAN DEFAULT 0,
    reader_scroll_position_page_index INTEGER,
    scene_id TEXT,
    last_viewed_time REAL DEFAULT 0,
    FOREIGN KEY(device_uuid) REFERENCES cloud_tab_devices(device_uuid) ON DELETE CASCADE
);

CREATE TABLE cloud_tab_close_requests(
    close_request_uuid TEXT PRIMARY KEY NOT NULL,
    system_fields BLOB NOT NULL,
    destination_device_uuid TEXT NOT NULL,
    url TEXT NOT NULL,
    tab_uuid TEXT NOT NULL,
    FOREIGN KEY(destination_device_uuid) REFERENCES cloud_tab_devices(device_uuid) ON DELETE CASCADE
);

CREATE TABLE metadata(
    key TEXT NOT NULL UNIQUE,
    value
);
```

`system_fields` is a plist like:
```bash
$ sqlite3 ~/Library/Containers/com.apple.Safari/Data/Library/Safari/CloudTabs.db "select hex(system_fields) from cloud_tab_close_requests" | xxd -r -p | plutil -convert xml1 - -o -
```
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>$archiver</key>
	<string>NSKeyedArchiver</string>
	<key>$objects</key>
	<array>
		<string>$null</string>
		<string>CloudTabCloseRequest</string>
		<dict>
			<key>$class</key>
			<dict>
				<key>CF$UID</key>
				<integer>8</integer>
			</dict>
			<key>RecordName</key>
			<dict>
				<key>CF$UID</key>
				<integer>3</integer>
			</dict>
			<key>ZoneID</key>
			<dict>
				<key>CF$UID</key>
				<integer>4</integer>
			</dict>
		</dict>
		<string>15522CA7-FE12-4A44-9D5C-2BE66DD6D1BB</string>
		<dict>
			<key>$class</key>
			<dict>
				<key>CF$UID</key>
				<integer>7</integer>
			</dict>
			<key>ZoneName</key>
			<dict>
				<key>CF$UID</key>
				<integer>5</integer>
			</dict>
			<key>anonymousCKUserID</key>
			<dict>
				<key>CF$UID</key>
				<integer>0</integer>
			</dict>
			<key>databaseScopeKey</key>
			<integer>0</integer>
			<key>ownerName</key>
			<dict>
				<key>CF$UID</key>
				<integer>6</integer>
			</dict>
		</dict>
		<string>CloudTabs</string>
		<string>__defaultOwner__</string>
		<dict>
			<key>$classes</key>
			<array>
				<string>CKRecordZoneID</string>
				<string>NSObject</string>
			</array>
			<key>$classname</key>
			<string>CKRecordZoneID</string>
		</dict>
		<dict>
			<key>$classes</key>
			<array>
				<string>CKRecordID</string>
				<string>NSObject</string>
			</array>
			<key>$classname</key>
			<string>CKRecordID</string>
		</dict>
		<dict>
			<key>$class</key>
			<dict>
				<key>CF$UID</key>
				<integer>10</integer>
			</dict>
			<key>NS.time</key>
			<real>780376728.16100001</real>
		</dict>
		<dict>
			<key>$classes</key>
			<array>
				<string>NSDate</string>
				<string>NSObject</string>
			</array>
			<key>$classname</key>
			<string>NSDate</string>
		</dict>
		<dict>
			<key>$class</key>
			<dict>
				<key>CF$UID</key>
				<integer>8</integer>
			</dict>
			<key>RecordName</key>
			<dict>
				<key>CF$UID</key>
				<integer>12</integer>
			</dict>
			<key>ZoneID</key>
			<dict>
				<key>CF$UID</key>
				<integer>13</integer>
			</dict>
		</dict>
		<string>__defaultOwner__</string>
		<dict>
			<key>$class</key>
			<dict>
				<key>CF$UID</key>
				<integer>7</integer>
			</dict>
			<key>ZoneName</key>
			<dict>
				<key>CF$UID</key>
				<integer>14</integer>
			</dict>
			<key>anonymousCKUserID</key>
			<dict>
				<key>CF$UID</key>
				<integer>0</integer>
			</dict>
			<key>databaseScopeKey</key>
			<integer>0</integer>
			<key>ownerName</key>
			<dict>
				<key>CF$UID</key>
				<integer>15</integer>
			</dict>
		</dict>
		<string>_defaultZone</string>
		<string>__defaultOwner__</string>
		<dict>
			<key>$class</key>
			<dict>
				<key>CF$UID</key>
				<integer>8</integer>
			</dict>
			<key>RecordName</key>
			<dict>
				<key>CF$UID</key>
				<integer>17</integer>
			</dict>
			<key>ZoneID</key>
			<dict>
				<key>CF$UID</key>
				<integer>13</integer>
			</dict>
		</dict>
		<string>__defaultOwner__</string>
		<string>Joe’s Mac mini</string>
		<string>mfxf03to</string>
		<data>
		/4m8Qg==
		</data>
	</array>
	<key>$top</key>
	<dict>
		<key>AllPCSKeyIDs</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>BaseToken</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>ChainParentPublicKeyID</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>ChainPrivateKey</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>ChainProtectionData</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>ConflictLoserEtags</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>CreatorUserRecordID</key>
		<dict>
			<key>CF$UID</key>
			<integer>11</integer>
		</dict>
		<key>DisplayedHostname</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>ETag</key>
		<dict>
			<key>CF$UID</key>
			<integer>19</integer>
		</dict>
		<key>ExpirationDate</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>Expired</key>
		<false/>
		<key>HasUpdatedExpiration</key>
		<false/>
		<key>HasUpdatedParentReference</key>
		<false/>
		<key>HasUpdatedShareReference</key>
		<false/>
		<key>KnownToServer</key>
		<true/>
		<key>LastModifiedUserRecordID</key>
		<dict>
			<key>CF$UID</key>
			<integer>16</integer>
		</dict>
		<key>MergeableValueDeltaRecord</key>
		<false/>
		<key>ModifiedByDevice</key>
		<dict>
			<key>CF$UID</key>
			<integer>18</integer>
		</dict>
		<key>MutableEncryptedPublicSharingKey</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>NeedsRollAndCounterSignKey</key>
		<false/>
		<key>PCSKeyID</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>ParentReference</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>Permission</key>
		<integer>0</integer>
		<key>PreviousParentReference</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>PreviousProtectionDataEtag</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>PreviousProtectionDataEtagFromUnitTest</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>PreviousShareReference</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>ProtectionData</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>ProtectionDataEtag</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>RecordCtime</key>
		<dict>
			<key>CF$UID</key>
			<integer>9</integer>
		</dict>
		<key>RecordID</key>
		<dict>
			<key>CF$UID</key>
			<integer>2</integer>
		</dict>
		<key>RecordMtime</key>
		<dict>
			<key>CF$UID</key>
			<integer>9</integer>
		</dict>
		<key>RecordType</key>
		<dict>
			<key>CF$UID</key>
			<integer>1</integer>
		</dict>
		<key>RoutingKey</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>ShareEtag</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>ShareReference</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>TombstonedPublicKeyIDs</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>URL</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>UpdatedExpiration</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>UseLightweightPCS</key>
		<false/>
		<key>WantsChainPCSKey</key>
		<false/>
		<key>WantsPublicSharingKey</key>
		<false/>
		<key>WasCached</key>
		<false/>
		<key>ZoneProtectionDataEtag</key>
		<dict>
			<key>CF$UID</key>
			<integer>0</integer>
		</dict>
		<key>ZoneishKeyID</key>
		<dict>
			<key>CF$UID</key>
			<integer>20</integer>
		</dict>
	</dict>
	<key>$version</key>
	<integer>100000</integer>
</dict>
</plist>
```

`cloud_tabs.position` is a gzip'ed JSON like:
```json
{
  "sortValues": [
    {
      "changeID": 0,
      "sortValue": 27893000,
      "deviceIdentifier": "1EBFBD4B-F483-44C6-9808-DFBE4097937C"
    }
  ]
}
```

`cloud_tab_close_requests` is as expected. There does not appear to be a way to
open tabs on remote devices.
```
$ sqlite3 -csv -header ~/Library/Containers/com.apple.Safari/Data/Library/Safari/CloudTabs.db "select close_request_uuid, destination_device_uuid, url, tab_uuid from cloud_tab_close_requests"
close_request_uuid,destination_device_uuid,url,tab_uuid
15522CA7-FE12-4A44-9D5C-2BE66DD6D1BB,1EBFBD4B-F483-44C6-9808-DFBE4097937C,https://news.ycombinator.com/item?id=45335635,1E7D3D06-B4BC-4FF1-94E8-0CF39169BF94
```
