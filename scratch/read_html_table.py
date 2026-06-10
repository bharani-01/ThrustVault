import re
from html.parser import HTMLParser

class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_table = False
        self.in_tr = False
        self.in_td = False
        self.rows = []
        self.current_row = []
        self.current_cell = ""

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.in_table = True
        elif tag == "tr" and self.in_table:
            self.in_tr = True
            self.current_row = []
        elif (tag == "td" or tag == "th") and self.in_tr:
            self.in_td = True
            self.current_cell = ""

    def handle_endtag(self, tag):
        if tag == "table":
            self.in_table = False
        elif tag == "tr" and self.in_table:
            self.in_tr = False
            self.rows.append(self.current_row)
        elif (tag == "td" or tag == "th") and self.in_tr:
            self.in_td = False
            self.current_row.append(self.current_cell.strip())

    def handle_data(self, data):
        if self.in_td:
            self.current_cell += data

with open(r"d:\motor data\motor_scraper\testParameter_P80Ⅲ Pin Agricultural UAV Motor KV120.xls", "r", encoding="utf-8-sig", errors="ignore") as f:
    html_content = f.read()

parser = TableParser()
parser.feed(html_content)

print(f"Total Rows parsed: {len(parser.rows)}")
for r in range(min(50, len(parser.rows))):
    row_vals = parser.rows[r]
    # Filter out empty trailing strings
    while row_vals and row_vals[-1] == '':
        row_vals.pop()
    if any(val != '' for val in row_vals):
        print(f"Row {r:02d}: {row_vals}")
