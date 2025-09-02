CloudTabs.db:
	rsync macmini:Library/Containers/com.apple.Safari/Data/Library/Safari/CloudTabs.db .

tabs.csv: tabs_to_csv.py CloudTabs.db
	python3 $^ > $@
