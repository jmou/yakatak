LIMIT = 10
NPX ?= npx

icloud/CloudTabs.db:
	rsync macmini:Library/Containers/com.apple.Safari/Data/Library/Safari/CloudTabs.db icloud/

icloud/tabs.csv: icloud/tabs_to_csv.py icloud/CloudTabs.db
	python3 $^ > $@

scrape/src/scrape.js: scrape/src/scrape.ts
	cd scrape && $(NPX) tsc

# iPad tabs
urls.txt: icloud/tabs.csv
	grep ^1EBFBD4B-F483-44C6-9808-DFBE4097937C, $< | tail -n+1 | cut -d, -f3 | head -n $(LIMIT) > $@

state/scrape/: scrape/src/scrape.js urls.txt
	$(NPX) -c 'xargs node scrape/src/scrape.js' < urls.txt
