LIMIT = 10

icloud/CloudTabs.db:
	rsync macmini:Library/Containers/com.apple.Safari/Data/Library/Safari/CloudTabs.db icloud/

icloud/tabs.csv: icloud/tabs_to_csv.py icloud/CloudTabs.db
	python3 $^ > $@

ipad-urls.txt: icloud/tabs.csv
	grep ^1EBFBD4B-F483-44C6-9808-DFBE4097937C, $< | tail -n+1 | cut -d, -f3 > $@

urls.txt: ipad-urls.txt
	head -n $(LIMIT) $< > $@

state/added.mark: db/src/add-urls.ts urls.txt
	rm -f state/db.sqlite3
	node $< state/db.sqlite3 < urls.txt
	touch $@

state/scrape/: collector/src/index.ts state/added.mark
	node $< --oneshot state/db.sqlite3
