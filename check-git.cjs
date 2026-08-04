const { execSync } = require('child_process');
const cwd = 'C:\\Users\\LTSC\\bareskrim-rekrutmen';

function run(cmd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', timeout: 30000 });
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}

// Cek apakah .env di-track oleh git
console.log('=== Cek .env tracked ===');
console.log(run('git ls-files .env'));

// Cek file yang mengandung token/webhook
console.log('\n=== Cek secrets di source ===');
console.log(run('git grep -l "MTUzMjcwOTMx" -- "*.ts" "*.tsx" "*.js" "*.json" 2>&1 || true'));
console.log(run('git grep -l "webhooks" -- "*.ts" "*.tsx" "*.env" 2>&1 || true'));

// Cek diff terakhir
console.log('\n=== Last commit files ===');
console.log(run('git diff --cached --stat 2>&1 || true'));
