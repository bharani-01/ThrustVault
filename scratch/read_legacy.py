import sys

# Try xlrd
try:
    import xlrd
    print("xlrd is installed!")
    wb = xlrd.open_workbook(r"d:\motor data\motor_scraper\testParameter_P80Ⅲ Pin Agricultural UAV Motor KV120.xls")
    sheet = wb.sheet_by_index(0)
    print(f"Sheet Name: {sheet.name}")
    print(f"Rows: {sheet.nrows}, Cols: {sheet.ncols}")
    for r in range(min(40, sheet.nrows)):
        row_vals = [sheet.cell_value(r, c) for c in range(sheet.ncols)]
        while row_vals and (row_vals[-1] is None or row_vals[-1] == ''):
            row_vals.pop()
        if any(val != '' for val in row_vals):
            print(f"Row {r:02d}: {row_vals}")
except Exception as e:
    print(f"xlrd check failed: {e}")

# Try openpyxl just in case (though it usually fails on xls)
try:
    import openpyxl
    wb = openpyxl.load_workbook(r"d:\motor data\motor_scraper\testParameter_P80Ⅲ Pin Agricultural UAV Motor KV120.xls")
    print("openpyxl opened it successfully!")
except Exception as e:
    print(f"openpyxl failed: {e}")
