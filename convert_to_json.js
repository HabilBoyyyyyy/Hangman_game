const fs = require('fs');
const path = require('path');

const wordsDir = path.join(__dirname, 'Words');
const files = fs.readdirSync(wordsDir).filter(f => f.endsWith('.js') && f !== 'all.js');

// We will use a mock window object to capture the data
global.window = {};

for (const file of files) {
  const filePath = path.join(wordsDir, file);
  const code = fs.readFileSync(filePath, 'utf8');
  
  // Evaluate the code. It does `window.WORD_BANK = window.WORD_BANK || {}; window.WORD_BANK["cat"] = [...]`
  try {
    eval(code);
  } catch (e) {
    console.error(`Failed to eval ${file}:`, e);
  }
}

// Now window.WORD_BANK has all the arrays
for (const [cat, arr] of Object.entries(global.window.WORD_BANK)) {
  const jsonPath = path.join(wordsDir, `${cat}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(arr, null, 2));
  console.log(`Created ${cat}.json`);
  
  // Delete the old JS file
  fs.unlinkSync(path.join(wordsDir, `${cat}.js`));
}

// Also delete all.js as it's no longer needed
if (fs.existsSync(path.join(wordsDir, 'all.js'))) {
  fs.unlinkSync(path.join(wordsDir, 'all.js'));
  console.log('Deleted all.js');
}

console.log('Conversion complete.');
