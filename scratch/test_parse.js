const fs = require('fs');
const path = require('path');
const XLSX = require('../libs/xlsx.full.min.js');

const xlsPath = path.join(__dirname, '../motor_scraper/testParameter_P80Ⅲ Pin Agricultural UAV Motor KV120.xls');
let htmlText = fs.readFileSync(xlsPath, 'utf8').trim();

const workbook = XLSX.read(htmlText, { type: 'string' });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Pre-fill merged cells
if (sheet['!merges']) {
    sheet['!merges'].forEach(merge => {
        const startRow = merge.s.r;
        const startCol = merge.s.c;
        const endRow = merge.e.r;
        const endCol = merge.e.c;
        
        const startCellRef = XLSX.utils.encode_cell({ r: startRow, c: startCol });
        const startCell = sheet[startCellRef];
        const val = startCell ? startCell.v : undefined;
        const formatted = startCell ? startCell.w : undefined;
        
        if (val !== undefined) {
            for (let r = startRow; r <= endRow; r++) {
                for (let c = startCol; c <= endCol; c++) {
                    const cellRef = XLSX.utils.encode_cell({ r: r, c: c });
                    if (!sheet[cellRef]) {
                        sheet[cellRef] = { v: val, t: startCell.t, w: formatted };
                    } else {
                        if (sheet[cellRef].v === undefined) sheet[cellRef].v = val;
                        if (sheet[cellRef].w === undefined) sheet[cellRef].w = formatted;
                    }
                }
            }
        }
    });
}

const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
console.log("JSON rows 1-25 (after merges resolved):");
json.slice(0, 25).forEach((row, i) => {
    console.log(`Row ${i}:`, row);
});
