const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'performance_analytics.html');
let content = fs.readFileSync(filePath, 'utf8');

// Replace Google Fonts import
content = content.replace(
    /href="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter:wght@[0-9;]+&family=Outfit:wght@[0-9;]+&display=swap"/g,
    'href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap"'
);

// Replace font-family settings from Outfit to Inter
content = content.replace(/['"]Outfit['"]/g, "'Inter'");

// Also override global h1, h2, h3, h4 in the local <style> block
// Let's add it right before the </style> tag.
if (content.includes('</style>')) {
    content = content.replace(
        '</style>',
        '\n        h1, h2, h3, h4 { font-family: \'Inter\', sans-serif; }\n    </style>'
    );
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated fonts in performance_analytics.html');
