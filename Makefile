LIMIT = 10
NPX ?= npx

icloud/CloudTabs.db:
	rsync macmini:Library/Containers/com.apple.Safari/Data/Library/Safari/CloudTabs.db icloud/

icloud/tabs.csv: icloud/tabs_to_csv.py icloud/CloudTabs.db
	python3 $^ > $@

ipad-urls.txt: icloud/tabs.csv
	grep ^1EBFBD4B-F483-44C6-9808-DFBE4097937C, $< | tail -n+1 | cut -d, -f3 > $@

urls.txt: ipad-urls.txt
	head -n $(LIMIT) $< > $@

state/scrape/: scrape/src/scrape.ts urls.txt
	$(NPX) -c 'xargs tsx scrape/src/scrape.ts' < urls.txt

state/derived.mark: derive.py state/scrape/
	for i in state/scrape/*; do uv run derive.py $$i; done
	touch $@

state/deck.json: state_to_deck.py state/derived.mark
	python3 state_to_deck.py $$(ls -d state/scrape/* | sort -t- -k2) > $@
