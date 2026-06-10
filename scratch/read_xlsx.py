import openpyxl

wb = openpyxl.load_workbook(r"d:\motor data\template datasets\MN3508 - Dataset Template.xlsx", data_only=True)
sheet = wb['MN3508 380']

for r in range(1, 30):
    row_vals = [sheet.cell(row=r, column=c).value for c in range(1, 11)]
    print(f"Row {r:02d}: {row_vals}")
