const { execSync } = require('child_process');
const cwd = 'C:\\Users\\LTSC\\bareskrim-rekrutmen';

function run(cmd) {
  try {
    const out = execSync(cmd, { cwd, encoding: 'utf8', timeout: 30000 });
    console.log(out);
  } catch (e) {
    console.log(e.stdout || '');
    console.log(e.stderr || '');
  }
}

console.log('=== GIT STATUS ===');
run('git status');

console.log('\n=== GIT ADD ===');
run('git add .');

console.log('\n=== GIT COMMIT ===');
run('git commit -m "feat: security hardening, CSV export, admin dashboard, error boundary, health check"');

console.log('\n=== GIT PUSH ===');
run('git push');
