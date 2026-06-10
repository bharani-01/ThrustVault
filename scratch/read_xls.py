import openpyxl

wb = openpyxl.load_workbook(r"d:\motor data\motor_scraper\Untitled spreadsheet.xlsx")
sheet = wb.active

print(f"Sheet Name: {sheet.title}")
print(f"Dimensions: {sheet.dimensions}")

for r in range(1, 40):
    row_vals = [sheet.cell(r, c).value for c in range(1, 15)]
    # Filter out trailing Nones
    while row_vals and row_vals[-1] is None:
        row_vals.pop()
    if any(val is not None for val in row_vals):
        print(f"Row {r:02d}: {row_vals}")
