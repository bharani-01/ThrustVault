const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const adminDir = path.join(root, 'admin_portal');
const adminSrcDir = path.join(adminDir, 'src');

// 1. Create directories
fs.mkdirSync(path.join(adminSrcDir, 'config'), { recursive: true });
fs.mkdirSync(path.join(adminSrcDir, 'utils'), { recursive: true });

// 2. Copy config and utils files
const filesToCopy = [
    { src: 'src/config/db.js', dest: 'admin_portal/src/config/db.js' },
    { src: 'src/config/cognito.js', dest: 'admin_portal/src/config/cognito.js' },
    { src: 'src/utils/queryBuilder.js', dest: 'admin_portal/src/utils/queryBuilder.js' },
    { src: 'src/utils/roleHelper.js', dest: 'admin_portal/src/utils/roleHelper.js' }
];

filesToCopy.forEach(f => {
    fs.copyFileSync(path.join(root, f.src), path.join(root, f.dest));
    console.log(`Copied ${f.src} to ${f.dest}`);
});

// 3. Modify admin_portal/server.js
const serverJsPath = path.join(adminDir, 'server.js');
let serverContent = fs.readFileSync(serverJsPath, 'utf8');

// Replace relative parent requires
serverContent = serverContent.replace(
    "require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });",
    "require('dotenv').config();"
);

serverContent = serverContent.replace(
    "require('../src/config/db')",
    "require('./src/config/db')"
);

serverContent = serverContent.replace(
    "require('../src/utils/queryBuilder')",
    "require('./src/utils/queryBuilder')"
);

serverContent = serverContent.replace(
    "require('../src/config/cognito')",
    "require('./src/config/cognito')"
);

serverContent = serverContent.replace(
    "require('../src/utils/roleHelper')",
    "require('./src/utils/roleHelper')"
);

fs.writeFileSync(serverJsPath, serverContent, 'utf8');
console.log('Successfully modified admin_portal/server.js to use local src files!');
